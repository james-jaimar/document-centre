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
  upsertActivationPage,
} from "../_shared/campaignAudience.ts";
import { renderTemplate } from "../_shared/sendBranchActivation.ts";
import { renderBareEmail } from "../_shared/branded-shell.ts";
import { htmlToText } from "../_shared/htmlToText.ts";
import { resolveAppOriginDetailed } from "../_shared/buildAuthLink.ts";
import {
  contactTag,
  createBroadcast,
  createSegment,
  ensureContactProperties,
  readResendKey,
  ResendApiError,
  segmentExists,
  upsertContact,
  verifyAccount,
  withResendUnsubscribeFooter,
} from "../_shared/resend.ts";


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
      .from("tenants").select("id, app_id, name, slug").eq("id", tenantId).maybeSingle();
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
    };

    const subject = renderTemplate(template.subject, vars, false);
    const bodyHtml = renderTemplate(template.body_html, vars, true);
    const bodyText = template.body_text
      ? renderTemplate(template.body_text, vars, false)
      : htmlToText(bodyHtml);
    const shellHtml = renderBareEmail({ preheader: subject, bodyHtml });
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
    let segmentId: string | null = account.resend_segment_id ?? null;
    if (segmentId && !(await segmentExists(apiKey, segmentId))) segmentId = null;
    if (!segmentId) {
      segmentId = await createSegment(apiKey, `${tenant.name} — Document Centre`);
      await admin.from("email_accounts").update({ resend_segment_id: segmentId }).eq("id", account.id);
    }


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

    // ── Contacts ───────────────────────────────────────────────────────────
    let synced = 0;
    let failed = 0;
    for (const target of sendable) {
      const email = (target.email ?? "").trim();
      let actionLink = origin;
      try {
        const slug = await upsertActivationPage(
          admin, { id: tenant.id, app_id: tenant.app_id }, target, email, target.contactName,
        );
        actionLink = `${origin}/activate/${slug}`;
      } catch (_e) {
        // A personal link is a nice-to-have; the broadcast still goes out.
      }

      const { first, last } = splitName(target.contactName || target.name);
      let contactId: string | null = null;
      let error: string | null = null;
      try {
        contactId = await upsertContact(apiKey, segmentId, {
          email,
          first_name: first,
          last_name: last,
          properties: { org_name: target.name, action_link: actionLink },
        });
        synced++;
      } catch (e) {
        failed++;
        error = e instanceof ResendApiError ? e.message : (e as Error).message;
      }

      await admin.from("platform_email_campaign_recipients").insert({
        campaign_id: campaignId,
        branch_id: target.kind === "branch" ? target.id : null,
        company_id: target.kind === "company" ? target.id : null,
        profile_id: target.kind === "customer" ? target.id : null,
        recipient_kind: target.kind,
        contact_name: target.contactName,
        email,
        action_link: actionLink,
        resend_contact_id: contactId,
        status: error ? "failed" : "sent",
        error,
        sent_at: error ? null : new Date().toISOString(),
      });

      results.push({
        name: target.name,
        email,
        status: error ? "failed" : "sent",
        ...(error ? { error } : {}),
      });

      await sleep(CONTACT_DELAY_MS);
    }

    if (!synced) {
      await admin.from("platform_email_campaigns")
        .update({ status: "failed", failed_count: failed }).eq("id", campaignId);
      return json({
        provider: "resend",
        campaign_id: campaignId,
        error: "No contacts could be added to Resend — the broadcast was not created.",
        totals: { sent: 0, failed, skipped: results.filter((r) => r.status === "skipped").length },
        results,
      }, 200);
    }

    // ── Broadcast ──────────────────────────────────────────────────────────
    let broadcastId: string;
    try {
      broadcastId = await createBroadcast(apiKey, {
        segment_id: segmentId,
        from,
        subject,
        html,
        text,
        reply_to: account.reply_to ?? undefined,
        name: `${template.name ?? templateSlug} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        send: true,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      });
    } catch (e) {
      const msg = e instanceof ResendApiError ? e.message : (e as Error).message;
      await admin.from("platform_email_campaigns")
        .update({ status: "failed", failed_count: sendable.length }).eq("id", campaignId);
      return json({ provider: "resend", campaign_id: campaignId, error: msg, results }, 200);
    }

    await admin.from("platform_email_campaigns").update({
      status: scheduledAt ? "scheduled" : "sent",
      resend_broadcast_id: broadcastId,
      sent_count: synced,
      failed_count: failed,
    }).eq("id", campaignId);

    return json({
      provider: "resend",
      campaign_id: campaignId,
      broadcast_id: broadcastId,
      scheduled_at: scheduledAt,
      over_free_limit: synced > FREE_CONTACT_LIMIT,
      totals: {
        sent: synced,
        failed,
        skipped: results.filter((r) => r.status === "skipped").length,
      },
      results,
    });
  } catch (e) {
    console.error("resend-broadcast-send error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
