// Sends a tenant marketing campaign as a Resend Broadcast.
//
// Flow: resolve the tenant's Resend mailbox → make sure a segment (contact
// list) exists → push the chosen recipients as contacts → create the broadcast
// against that segment with send/schedule → record the campaign + recipients
// so History and the Resend webhook can match events back.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type Audience,
  callerCanSendForTenant,
  resolveTargets,
  fetchSuppressedEmails,
  normalizeIds,
  upsertActivationPages,
} from "../_shared/campaignAudience.ts";
import { renderTemplate } from "../_shared/sendBranchActivation.ts";
import { findRelativeImages, normalizeBroadcastTokens, renderAuthoredEmail } from "../_shared/advancedEmail.ts";
import { htmlToText } from "../_shared/htmlToText.ts";
import { resolveAppOriginDetailed } from "../_shared/buildAuthLink.ts";
import {
  contactTag,
  createBroadcast,
  ensureContactProperties,
  getOrCreateSegment,
  listSegmentContacts,
  readResendKey,
  removeContactFromSegment,
  ResendApiError,
  upsertContact,
  verifyAccount,
  withResendUnsubscribeFooter,
} from "../_shared/resend.ts";

/**
 * Resend plans cap how many segments an account may hold, so every broadcast
 * reuses this one shared list. Membership is reset to exactly the recipients
 * chosen for the campaign before the broadcast is created.
 */
const SHARED_SEGMENT_NAME = "General";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Free Resend accounts allow up to 1,000 marketing contacts per month. */
const FREE_CONTACT_LIMIT = 1000;
/** Resend allows 10 requests/second; stay comfortably under it. */
const CONTACT_DELAY_MS = 130;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function splitName(name: string): { first: string; last: string | null } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { first: name.trim() || "there", last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const body = await req.json();

    // Large campaigns are sent in three short calls so nothing runs past the
    // request time limit: prepare → sync (repeat) → finalise.
    const phase = String(body.phase ?? "prepare");
    if (phase === "sync") return await runSync(admin, caller.id, body);
    if (phase === "finalise") return await runFinalise(admin, caller.id, body);

    const tenantId = String(body.tenant_id ?? "");
    const audience = (body.audience ?? "branch") as Audience;
    const templateSlug = String(body.template_slug ?? "");
    const recipientIds = normalizeIds(body.recipient_ids ?? body.branch_ids);
    const dryRun = !!body.dry_run;
    const scheduledAt = body.scheduled_at ? String(body.scheduled_at) : null;

    if (!tenantId || !templateSlug || !recipientIds.length) {
      return json({ error: "tenant_id, template_slug and recipient_ids are required" }, 400);
    }

    const { allowed } = await callerCanSendForTenant(admin, caller.id, tenantId);
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const { data: tenant } = await admin
      .from("tenants").select("id, app_id, name, slug, website_url").eq("id", tenantId).maybeSingle();
    if (!tenant) return json({ error: "Tenant not found" }, 404);

    // ── Sender: the tenant's Resend mailbox ────────────────────────────────
    const { data: account } = await admin
      .from("email_accounts")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("branch_id", null)
      .eq("transport", "resend")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!account) {
      return json({
        error: "RESEND_NOT_CONFIGURED",
        message: "This tenant has no active Resend mailbox. Add one under Settings → Email Accounts.",
      }, 200);
    }

    const apiKey = await readResendKey(admin, account.resend_api_key_secret_id);
    if (!apiKey) return json({ error: "Resend API key missing from the vault for this mailbox." }, 500);

    const { data: template } = await admin
      .from("platform_email_templates").select("*").eq("slug", templateSlug).maybeSingle();
    if (!template) return json({ error: `Template not found: ${templateSlug}` }, 404);

    // ── Recipients ─────────────────────────────────────────────────────────
    const targets = await resolveTargets(admin, tenantId, audience, recipientIds);
    const suppressed = await fetchSuppressedEmails(
      admin, tenantId, targets.map((t) => t.email ?? "").filter(Boolean),
    );

    const results: Array<{ name: string; email: string | null; status: string; error?: string }> = [];
    const sendable = targets.filter((t) => {
      const email = (t.email ?? "").trim().toLowerCase();
      if (!email) {
        results.push({ name: t.name, email: null, status: "skipped", error: "No email on file" });
        return false;
      }
      if (suppressed.has(email)) {
        results.push({ name: t.name, email, status: "skipped", error: "Unsubscribed or previously bounced" });
        return false;
      }
      return true;
    });

    if (!sendable.length) {
      return json({ provider: "resend", totals: { sent: 0, skipped: results.length, failed: 0 }, results }, 200);
    }

    const resolved = await resolveAppOriginDetailed(admin, tenant.id, null);
    const origin = resolved?.origin ?? "https://document-centre.com";
    const senderLabel = account.from_name || tenant.name;
    const from = `${senderLabel} <${account.from_email}>`;

    // Broadcast bodies are rendered once; per-person values come from Resend
    // contact properties, which share the {{{contact.<key>}}} namespace with
    // the built-in first_name / last_name / email tags.
    const { data: addressSetting } = await admin.from("tenant_settings")
      .select("setting_value").eq("tenant_id", tenantId)
      .eq("category", "documents").eq("setting_key", "invoice_address").maybeSingle();
    const senderPostalAddress = typeof addressSetting?.setting_value === "string"
      ? addressSetting.setting_value : "";

    const vars: Record<string, string> = {
      contact_name: contactTag("first_name", "there"),
      customer_name: contactTag("first_name", "there"),
      branch_name: contactTag("org_name", tenant.name),
      company_name: contactTag("org_name", tenant.name),
      tenant_name: tenant.name,
      activation_link: contactTag("action_link", origin),
      action_link: contactTag("action_link", origin),
      store_url: origin,
      portal_name: tenant.name,
      login_email: contactTag("email"),
      tenant_website: tenant.website_url || origin,
      sender_postal_address: senderPostalAddress,
    };

    const subject = renderTemplate(template.subject, vars, false);
    const bodyHtml = normalizeBroadcastTokens(renderTemplate(template.body_html, vars, true));
    const bodyText = template.body_text
      ? renderTemplate(template.body_text, vars, false)
      : htmlToText(bodyHtml);
    const missingImages = findRelativeImages(bodyHtml);
    if (missingImages.length) {
      return json({
        provider: "resend",
        error: `Replace the unresolved template images before sending: ${missingImages.join(", ")}`,
        missing_images: missingImages,
        results,
      }, 200);
    }
    const shellHtml = renderAuthoredEmail(bodyHtml, template.preheader || subject);
    const shellText = bodyText;

    const { html, text } = withResendUnsubscribeFooter(shellHtml, shellText, senderLabel);

    if (dryRun) {
      return json({
        provider: "resend",
        dry_run: true,
        subject,
        html,
        over_free_limit: sendable.length > FREE_CONTACT_LIMIT,
        totals: { dry_run_ok: sendable.length, skipped: results.length, failed: 0 },
        results: [
          ...results,
          ...sendable.map((t) => ({ name: t.name, email: t.email, status: "dry_run_ok" })),
        ],
      });
    }

    // ── Pre-flight: key access + verified sending domain ───────────────────
    const check = await verifyAccount(apiKey, account.from_email);
    if (!check.ok) {
      return json({ provider: "resend", error: check.message, results }, 200);
    }

    // ── Custom contact properties must exist before any contact uses them ──
    try {
      await ensureContactProperties(apiKey, [
        { key: "org_name", type: "string", fallback_value: tenant.name },
        { key: "action_link", type: "string", fallback_value: origin },
      ]);
    } catch (e) {
      const msg = e instanceof ResendApiError ? e.message : (e as Error).message;
      return json({
        provider: "resend",
        error: `Resend would not set up the personalisation fields (org_name, action_link): ${msg}`,
        results,
      }, 200);
    }

    // ── Segment ────────────────────────────────────────────────────────────
    // One shared segment for every broadcast (Resend caps segments per
    // account). Membership is trimmed below so a broadcast can never inherit
    // contacts selected for an earlier campaign.
    const segmentId = await getOrCreateSegment(apiKey, SHARED_SEGMENT_NAME);


    // ── Campaign row ───────────────────────────────────────────────────────
    const { data: campaign, error: campErr } = await admin
      .from("platform_email_campaigns")
      .insert({
        tenant_id: tenantId,
        template_slug: templateSlug,
        subject_snapshot: subject,
        body_html_snapshot: html,
        body_text_snapshot: text,
        total_recipients: sendable.length,
        sent_count: 0,
        failed_count: 0,
        skipped_count: results.length,
        status: "running",
        kind: "marketing",
        scope: "tenant",
        audience,
        provider: "resend",
        resend_segment_id: segmentId,
        created_by: caller.id,
      })
      .select("id")
      .single();
    if (campErr) return json({ error: `campaign_insert: ${campErr.message}` }, 500);
    const campaignId = (campaign as { id: string }).id;

    // ── Recipient rows (pending) + personal links ──────────────────────────
    // Contacts themselves are pushed to Resend in the `sync` phase so a large
    // list never runs past the request time limit.
    let slugs = new Map<string, string>();
    try {
      slugs = await upsertActivationPages(
        admin,
        { id: tenant.id, app_id: tenant.app_id },
        sendable.map((t) => ({
          id: t.id,
          kind: t.kind,
          email: (t.email ?? "").trim(),
          contactName: t.contactName || t.name,
        })),
      );
    } catch (e) {
      // A personal link is a nice-to-have; the broadcast still goes out.
      console.error("activation pages:", (e as Error).message);
    }

    const rows = sendable.map((t) => {
      const slug = slugs.get(t.id);
      return {
        campaign_id: campaignId,
        branch_id: t.kind === "branch" ? t.id : null,
        company_id: t.kind === "company" ? t.id : null,
        profile_id: t.kind === "customer" ? t.id : null,
        recipient_kind: t.kind,
        contact_name: t.contactName || t.name,
        org_name: t.name,
        email: (t.email ?? "").trim(),
        action_link: slug ? `${origin}/activate/${slug}` : origin,
        status: "pending",
      };
    });
    for (const part of chunkArray(rows, 200)) {
      const { error } = await admin.from("platform_email_campaign_recipients").insert(part);
      if (error) {
        await admin.from("platform_email_campaigns")
          .update({ status: "failed", error_message: `recipient_insert: ${error.message}` })
          .eq("id", campaignId);
        return json({ error: `recipient_insert: ${error.message}` }, 500);
      }
    }

    return json({
      provider: "resend",
      phase: "prepare",
      campaign_id: campaignId,
      remaining: rows.length,
      over_free_limit: rows.length > FREE_CONTACT_LIMIT,
      totals: {
        pending: rows.length,
        sent: 0,
        failed: 0,
        skipped: results.filter((r) => r.status === "skipped").length,
      },
      results,
    });
  } catch (e) {
    console.error("resend-broadcast-send error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Later phases: push contacts in small batches, then create the broadcast.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type Admin = any;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadCampaignContext(admin: Admin, callerId: string, campaignId: string) {
  const { data: campaign } = await admin
    .from("platform_email_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!campaign) return { error: json({ error: "Campaign not found" }, 404) };

  const { allowed } = await callerCanSendForTenant(admin, callerId, campaign.tenant_id);
  if (!allowed) return { error: json({ error: "Forbidden" }, 403) };

  const { data: account } = await admin
    .from("email_accounts").select("*")
    .eq("tenant_id", campaign.tenant_id).is("branch_id", null)
    .eq("transport", "resend").eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  if (!account) return { error: json({ error: "This tenant has no active Resend mailbox." }, 200) };

  const apiKey = await readResendKey(admin, account.resend_api_key_secret_id);
  if (!apiKey) return { error: json({ error: "Resend API key missing from the vault." }, 500) };

  return { campaign, account, apiKey };
}

async function countRecipients(admin: Admin, campaignId: string, status: string): Promise<number> {
  const { count } = await admin
    .from("platform_email_campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId).eq("status", status);
  return count ?? 0;
}

/** Pushes the next batch of pending recipients into the shared segment. */
async function runSync(admin: Admin, callerId: string, body: any): Promise<Response> {
  const ctx = await loadCampaignContext(admin, callerId, String(body.campaign_id ?? ""));
  if ("error" in ctx) return ctx.error!;
  const { campaign, apiKey } = ctx as any;

  const segmentId = campaign.resend_segment_id;
  if (!segmentId) return json({ error: "This campaign has no Resend contact list." }, 400);

  const batchSize = Math.min(Math.max(Number(body.batch_size ?? 75), 1), 150);
  const { data: batch, error: batchErr } = await admin
    .from("platform_email_campaign_recipients")
    .select("id, email, contact_name, org_name, action_link")
    .eq("campaign_id", campaign.id).eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);
  if (batchErr) return json({ error: `recipient_read: ${batchErr.message}` }, 500);

  const results: Array<{ name: string; email: string; status: string; error?: string }> = [];
  for (const row of ((batch ?? []) as any[])) {
    const { first, last } = splitName(row.contact_name || row.org_name || row.email);
    let contactId: string | null = null;
    let error: string | null = null;
    try {
      contactId = await upsertContact(apiKey, segmentId, {
        email: row.email,
        first_name: first,
        last_name: last,
        properties: { org_name: row.org_name ?? row.contact_name ?? "", action_link: row.action_link ?? "" },
      });
    } catch (e) {
      error = e instanceof ResendApiError ? e.message : (e as Error).message;
    }

    await admin.from("platform_email_campaign_recipients").update({
      resend_contact_id: contactId,
      status: error ? "failed" : "sent",
      error,
      sent_at: error ? null : new Date().toISOString(),
    }).eq("id", row.id);

    results.push({
      name: row.org_name || row.contact_name || row.email,
      email: row.email,
      status: error ? "failed" : "sent",
      ...(error ? { error } : {}),
    });
    await sleep(CONTACT_DELAY_MS);
  }

  const remaining = await countRecipients(admin, campaign.id, "pending");
  const sent = await countRecipients(admin, campaign.id, "sent");
  const failed = await countRecipients(admin, campaign.id, "failed");
  await admin.from("platform_email_campaigns")
    .update({ sent_count: sent, failed_count: failed }).eq("id", campaign.id);

  return json({
    provider: "resend",
    phase: "sync",
    campaign_id: campaign.id,
    remaining,
    totals: { sent, failed, skipped: campaign.skipped_count ?? 0 },
    results,
  });
}

/** Trims the shared list to this campaign's recipients, then sends. */
async function runFinalise(admin: Admin, callerId: string, body: any): Promise<Response> {
  const ctx = await loadCampaignContext(admin, callerId, String(body.campaign_id ?? ""));
  if ("error" in ctx) return ctx.error!;
  const { campaign, account, apiKey } = ctx as any;

  const segmentId = campaign.resend_segment_id;
  if (!segmentId) return json({ error: "This campaign has no Resend contact list." }, 400);

  const pending = await countRecipients(admin, campaign.id, "pending");
  if (pending > 0) {
    return json({ error: `${pending} recipients are still being added — finish that first.`, remaining: pending }, 400);
  }

  const sent = await countRecipients(admin, campaign.id, "sent");
  const failed = await countRecipients(admin, campaign.id, "failed");
  if (!sent) {
    const message = "No contacts could be added to Resend — the broadcast was not created.";
    await admin.from("platform_email_campaigns")
      .update({ status: "failed", failed_count: failed, error_message: message }).eq("id", campaign.id);
    return json({ provider: "resend", campaign_id: campaign.id, error: message, totals: { sent: 0, failed } }, 200);
  }

  // Everyone who should receive this broadcast.
  const intended = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("platform_email_campaign_recipients")
      .select("email").eq("campaign_id", campaign.id).eq("status", "sent")
      .range(from, from + 999);
    const rows = (data ?? []) as any[];
    for (const r of rows) if (r.email) intended.add(String(r.email).trim().toLowerCase());
    if (rows.length < 1000) break;
  }

  try {
    const current = await listSegmentContacts(apiKey, segmentId);
    for (const contact of current) {
      const email = (contact.email ?? "").trim().toLowerCase();
      if (email && intended.has(email)) continue;
      await removeContactFromSegment(apiKey, contact.id ?? email, segmentId);
      await sleep(CONTACT_DELAY_MS);
    }
  } catch (e) {
    const msg = e instanceof ResendApiError ? e.message : (e as Error).message;
    const message =
      `The contact list could not be limited to the chosen recipients, so the broadcast was not sent. Resend said: ${msg}`;
    await admin.from("platform_email_campaigns")
      .update({ status: "failed", error_message: message }).eq("id", campaign.id);
    return json({ provider: "resend", campaign_id: campaign.id, error: message }, 200);
  }

  const scheduledAt = body.scheduled_at ? String(body.scheduled_at) : null;
  const senderLabel = account.from_name || campaign.subject_snapshot;
  let broadcastId: string;
  try {
    broadcastId = await createBroadcast(apiKey, {
      segment_id: segmentId,
      from: `${account.from_name || senderLabel} <${account.from_email}>`,
      subject: campaign.subject_snapshot,
      html: campaign.body_html_snapshot,
      text: campaign.body_text_snapshot,
      reply_to: account.reply_to ?? undefined,
      name: `${campaign.template_slug} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      send: true,
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    });
  } catch (e) {
    const msg = e instanceof ResendApiError ? e.message : (e as Error).message;
    await admin.from("platform_email_campaigns")
      .update({ status: "failed", error_message: msg }).eq("id", campaign.id);
    return json({ provider: "resend", campaign_id: campaign.id, error: msg }, 200);
  }

  await admin.from("platform_email_campaigns").update({
    status: scheduledAt ? "scheduled" : "sent",
    resend_broadcast_id: broadcastId,
    sent_count: sent,
    failed_count: failed,
    error_message: null,
  }).eq("id", campaign.id);

  return json({
    provider: "resend",
    phase: "finalise",
    campaign_id: campaign.id,
    broadcast_id: broadcastId,
    scheduled_at: scheduledAt,
    remaining: 0,
    over_free_limit: sent > FREE_CONTACT_LIMIT,
    totals: { sent, failed, skipped: campaign.skipped_count ?? 0 },
  });
}

