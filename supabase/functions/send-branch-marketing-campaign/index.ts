// Bulk-sends the Document Centre marketing email to selected branches.
//
// Important: this function does not call the `send-email` edge function per
// recipient. Large campaigns are prepared here, inserted directly into
// public.email_outbox, and then the Cloud Run email worker drains the queue at
// its own transport-safe pace. This avoids Supabase/Edge gateway fan-out rate
// limits while preserving per-recipient tracking rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOriginDetailed } from "../_shared/buildAuthLink.ts";
import { renderTemplate } from "../_shared/sendBranchActivation.ts";
import { renderBrandedEmail, renderBrandedText } from "../_shared/branded-shell.ts";
import { htmlToText, deriveSnippet } from "../_shared/htmlToText.ts";
import { appendTrackingPixel } from "../_shared/emailTracking.ts";
import { kickEmailWorker } from "../_shared/email-kick.ts";

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYNC_LIMIT = 25;
const PREPARE_CONCURRENCY = 8;
const INSERT_CHUNK = 500;
const NO_PLATFORM_SENDER =
  "Platform sender mailbox not configured — connect one under Platform → Settings → Email.";

type SupabaseAdmin = ReturnType<typeof createClient>;

interface BranchRow {
  id: string;
  name: string;
  email: string | null;
  slug: string | null;
  url_slug: string | null;
  trading_name: string | null;
}

interface CampaignRow {
  id: string;
  tenant_id: string;
  template_slug: string;
  subject_snapshot: string;
  body_html_snapshot: string;
  body_text_snapshot: string | null;
}

interface RecipientRow {
  id: string;
  branch_id: string | null;
  email: string | null;
}

type FunctionBody = {
  retry_failed?: boolean;
  retry_campaign_id?: string;
  campaign_id?: string;
  template_slug?: string;
  tenant_id?: string;
  branch_ids?: unknown;
  dry_run?: boolean;
  // Follow-up ("resend to unopened") mode:
  resend_unopened_campaign_id?: string;
  subject_override?: string;
  preview_only?: boolean;
};

interface DispatchContext {
  admin: SupabaseAdmin;
  template: {
    subject: string;
    body_html: string;
    body_text: string | null;
  };
  tenant: { id: string; app_id: string | null; name: string; slug: string | null };
  appOrigin: string;
  campaignId: string;
  platformSenderId: string | null;
}

interface PreparedRecipient {
  branch: BranchRow;
  recipientId: string;
  activationLink: string;
  outboxRow: Record<string, unknown>;
}

interface FailedRecipient {
  branch: BranchRow;
  recipientId: string;
  activationLink?: string;
  error: string;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mintSlug(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizeBranchIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getPlatformSenderId(admin: SupabaseAdmin): Promise<string | null> {
  const { data: platformDefault, error: defaultErr } = await admin
    .from("email_accounts")
    .select("id")
    .is("tenant_id", null)
    .is("branch_id", null)
    .eq("is_active", true)
    .eq("is_default", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (defaultErr) throw new Error(`Platform sender lookup failed: ${defaultErr.message}`);
  if (platformDefault?.id) return platformDefault.id;

  const { data: anyPlatform, error: anyErr } = await admin
    .from("email_accounts")
    .select("id")
    .is("tenant_id", null)
    .is("branch_id", null)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyErr) throw new Error(`Platform sender lookup failed: ${anyErr.message}`);
  return anyPlatform?.id ?? null;
}

async function upsertActivationPage(
  admin: SupabaseAdmin,
  tenant: DispatchContext["tenant"],
  branch: BranchRow,
  email: string,
  contactName: string,
): Promise<string> {
  const { data: existingPage, error: lookupErr } = await admin
    .from("platform_branch_activation_pages")
    .select("slug")
    .eq("branch_id", branch.id)
    .maybeSingle();
  if (lookupErr) throw new Error(`activation_page_lookup: ${lookupErr.message}`);

  const pageSlug = existingPage?.slug ?? mintSlug();
  const payload = {
    tenant_id: tenant.id,
    branch_id: branch.id,
    app_id: tenant.app_id,
    slug: pageSlug,
    contact_email: email,
    contact_name: contactName,
    is_active: true,
  };

  const { error: upsertErr } = await admin
    .from("platform_branch_activation_pages")
    .upsert(payload, { onConflict: "branch_id" });
  if (upsertErr) throw new Error(`activation_page_upsert: ${upsertErr.message}`);

  return pageSlug;
}

async function prepareOneRecipient(
  ctx: DispatchContext,
  branch: BranchRow,
  recipientId: string,
): Promise<{ prepared?: PreparedRecipient; failed?: FailedRecipient }> {
  const email = (branch.email ?? "").trim().toLowerCase();
  const contactName = branch.trading_name || branch.name;

  if (!email) {
    return { failed: { branch, recipientId, error: "Branch has no email address" } };
  }

  if (!ctx.platformSenderId) {
    return { failed: { branch, recipientId, error: NO_PLATFORM_SENDER } };
  }

  try {
    const pageSlug = await upsertActivationPage(ctx.admin, ctx.tenant, branch, email, contactName);
    const activationLink = `${ctx.appOrigin}/activate/${pageSlug}`;
    const vars: Record<string, string> = {
      branch_name: branch.name,
      contact_name: contactName,
      tenant_name: ctx.tenant.name,
      activation_link: activationLink,
    };

    const subject = renderTemplate(ctx.template.subject, vars, false);
    const htmlBody = renderTemplate(ctx.template.body_html, vars, true);
    const textBody = ctx.template.body_text
      ? renderTemplate(ctx.template.body_text, vars, false)
      : htmlToText(htmlBody);
    const preheader = deriveSnippet(textBody)
      || `Activate your ${branch.name} storefront on ${ctx.tenant.name}.`;

    const html = renderBrandedEmail({
      preheader,
      heading: subject,
      bodyHtml: htmlBody,
      hideLegalLinks: true,
      siteLinkUrl: ctx.appOrigin,
      siteLinkLabel: ctx.appOrigin.replace(/^https?:\/\//, ""),
    });
    const text = renderBrandedText({
      heading: subject,
      bodyText: textBody,
      siteLinkUrl: ctx.appOrigin,
    });
    const trackedHtml = await appendTrackingPixel(html, ctx.campaignId, recipientId, null);

    return {
      prepared: {
        branch,
        recipientId,
        activationLink,
        outboxRow: {
          tenant_id: null,
          branch_id: null,
          app_id: ctx.tenant.app_id ?? null,
          email_account_id: ctx.platformSenderId,
          to_email: email,
          from_name: `${ctx.tenant.name} via Document Centre`,
          subject,
          html: trackedHtml,
          text_body: text,
          category: "system",
          related_type: "branch_marketing",
          related_id: branch.id,
          metadata: {
            tenant_id: ctx.tenant.id,
            branch_id: branch.id,
            campaign_id: ctx.campaignId,
            recipient_id: recipientId,
            kind: "branch_marketing",
          },
          attachments: [],
          status: "queued",
          next_attempt_at: new Date().toISOString(),
        },
      },
    };
  } catch (e) {
    return {
      failed: {
        branch,
        recipientId,
        error: (e as Error).message ?? "unknown",
      },
    };
  }
}

async function prepareRecipients(
  ctx: DispatchContext,
  pairs: { branch: BranchRow; recipientId: string }[],
): Promise<{ prepared: PreparedRecipient[]; failed: FailedRecipient[] }> {
  const prepared: PreparedRecipient[] = [];
  const failed: FailedRecipient[] = [];
  for (const batch of chunk(pairs, PREPARE_CONCURRENCY)) {
    const settled = await Promise.all(batch.map(({ branch, recipientId }) => prepareOneRecipient(ctx, branch, recipientId)));
    for (const result of settled) {
      if (result.prepared) prepared.push(result.prepared);
      if (result.failed) failed.push(result.failed);
    }
  }
  return { prepared, failed };
}

async function refreshCampaignCounts(
  admin: SupabaseAdmin,
  campaignId: string,
  status?: string,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const { data, error } = await admin
    .from("platform_email_campaign_recipients")
    .select("status")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(`campaign_count_refresh: ${error.message}`);

  const rows = (data ?? []) as Array<{ status: string }>;
  const sent = rows.filter((r) => r.status === "sent" || r.status === "sent_existing_user" || r.status === "completed").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const skipped = rows.filter((r) => r.status.startsWith("skipped")).length;
  const update: Record<string, unknown> = {
    sent_count: sent,
    failed_count: failed,
    skipped_count: skipped,
  };
  if (status) update.status = status;
  const { error: updateErr } = await admin
    .from("platform_email_campaigns")
    .update(update)
    .eq("id", campaignId);
  if (updateErr) throw new Error(`campaign_count_update: ${updateErr.message}`);
  return { sent, failed, skipped };
}

async function bulkUpdateRecipients(
  admin: SupabaseAdmin,
  campaignId: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (!rows.length) return;
  for (const c of chunk(rows, INSERT_CHUNK)) {
    const payload = c.map((r) => ({ campaign_id: campaignId, ...r }));
    const { error } = await admin
      .from("platform_email_campaign_recipients")
      .upsert(payload, { onConflict: "id" });
    if (error) throw new Error(`recipient_bulk_update: ${error.message}`);
  }
}

async function enqueuePrepared(
  admin: SupabaseAdmin,
  campaignId: string,
  prepared: PreparedRecipient[],
  failed: FailedRecipient[],
): Promise<{ queued: number; failed: number }> {
  // Mark prepare-time failures in one bulk upsert per chunk.
  await bulkUpdateRecipients(
    admin,
    campaignId,
    failed.map((f) => ({
      id: f.recipientId,
      status: "failed",
      error: f.error,
      action_link: f.activationLink ?? null,
    })),
  );

  let queued = 0;
  const insertFailed: FailedRecipient[] = [];
  for (const c of chunk(prepared, INSERT_CHUNK)) {
    const { error } = await admin.from("email_outbox").insert(c.map((p) => p.outboxRow));
    if (error) {
      for (const p of c) {
        insertFailed.push({
          branch: p.branch,
          recipientId: p.recipientId,
          activationLink: p.activationLink,
          error: `email_outbox_insert: ${error.message}`,
        });
      }
      continue;
    }

    queued += c.length;
    await bulkUpdateRecipients(
      admin,
      campaignId,
      c.map((p) => ({
        id: p.recipientId,
        status: "sent",
        sent_at: new Date().toISOString(),
        error: null,
        action_link: p.activationLink,
      })),
    );

    await refreshCampaignCounts(admin, campaignId, "running");
  }

  if (insertFailed.length) {
    await bulkUpdateRecipients(
      admin,
      campaignId,
      insertFailed.map((f) => ({
        id: f.recipientId,
        status: "failed",
        error: f.error,
        action_link: f.activationLink ?? null,
      })),
    );
  }

  const failedCount = failed.length + insertFailed.length;
  await refreshCampaignCounts(admin, campaignId, failedCount > 0 ? "completed_with_errors" : "completed");

  if (queued > 0) kickEmailWorker();
  return { queued, failed: failedCount };
}


async function runDispatch(
  ctx: DispatchContext,
  pairs: { branch: BranchRow; recipientId: string }[],
  _skipped: number,
): Promise<{ queued: number; failed: number; preparedFailed: FailedRecipient[] }> {
  const { prepared, failed } = await prepareRecipients(ctx, pairs);
  const counts = await enqueuePrepared(ctx.admin, ctx.campaignId, prepared, failed);
  return { ...counts, preparedFailed: failed };
}

async function handleRetry(
  admin: SupabaseAdmin,
  campaignId: string,
  templateSlugFromBody: string,
): Promise<Response> {
  const { data: campaign, error: campErr } = await admin
    .from("platform_email_campaigns")
    .select("id, tenant_id, template_slug, subject_snapshot, body_html_snapshot, body_text_snapshot")
    .eq("id", campaignId)
    .maybeSingle();
  if (campErr) return json({ error: `Campaign lookup failed: ${campErr.message}` }, 500);
  if (!campaign) return json({ error: "Campaign not found" }, 404);
  if (!campaign.tenant_id) return json({ error: "Campaign has no tenant" }, 400);

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, app_id, name, slug")
    .eq("id", campaign.tenant_id)
    .maybeSingle();
  if (!tenant) return json({ error: "Tenant not found" }, 404);

  const { data: recipients, error: recErr } = await admin
    .from("platform_email_campaign_recipients")
    .select("id, branch_id, email")
    .eq("campaign_id", campaignId)
    .eq("status", "failed")
    .not("branch_id", "is", null);
  if (recErr) return json({ error: `Recipient lookup failed: ${recErr.message}` }, 500);

  const recipientRows = (recipients ?? []) as RecipientRow[];
  if (!recipientRows.length) {
    return json({
      campaign_id: campaignId,
      retry: true,
      queued: false,
      totals: { sent: 0, failed: 0, skipped: 0, pending: 0 },
      message: "No failed recipients to retry.",
    });
  }

  // Load ALL branches for the tenant in one query and filter in memory.
  // Avoids passing a 400+ UUID `id=in.(...)` URL through PostgREST — that
  // was blowing the gateway URL-length limit and returning the giant
  // encoded-UUID error the operator was seeing on retry.
  const { data: branches, error: branchErr } = await admin
    .from("branches")
    .select("id, name, email, slug, url_slug, trading_name")
    .eq("tenant_id", campaign.tenant_id);
  if (branchErr) return json({ error: `Branch lookup failed: ${branchErr.message}` }, 500);

  const branchesById = new Map<string, BranchRow>();
  for (const b of (branches ?? []) as BranchRow[]) branchesById.set(b.id, b);

  const pairs: { branch: BranchRow; recipientId: string }[] = [];
  const missing: FailedRecipient[] = [];
  for (const r of recipientRows) {
    const branch = r.branch_id ? branchesById.get(r.branch_id) : null;
    if (!branch) {
      missing.push({
        branch: { id: r.branch_id ?? "", name: "Unknown branch", email: r.email, slug: null, url_slug: null, trading_name: null },
        recipientId: r.id,
        error: "Branch was not found for retry",
      });
      continue;
    }
    pairs.push({ branch, recipientId: r.id });
  }

  const callerOrigin = null;
  const resolved = await resolveAppOriginDetailed(admin, tenant.id, callerOrigin);
  if (!resolved) return json({ error: "Could not resolve app origin" }, 500);
  const platformSenderId = await getPlatformSenderId(admin);
  const campaignRow = campaign as CampaignRow;
  const ctx: DispatchContext = {
    admin,
    template: {
      subject: campaignRow.subject_snapshot,
      body_html: campaignRow.body_html_snapshot,
      body_text: campaignRow.body_text_snapshot,
    },
    tenant,
    appOrigin: resolved.origin,
    campaignId,
    platformSenderId,
  };

  await admin.from("platform_email_campaign_recipients")
    .update({ status: "pending", error: null, sent_at: null })
    .eq("campaign_id", campaignId)
    .eq("status", "failed");
  await admin.from("platform_email_campaigns").update({ status: "running" }).eq("id", campaignId);

  if (missing.length) {
    await bulkUpdateRecipients(
      admin,
      campaignId,
      missing.map((f) => ({ id: f.recipientId, status: "failed", error: f.error })),
    );
  }


  EdgeRuntime.waitUntil((async () => {
    try {
      await runDispatch(ctx, pairs, 0);
    } catch (err) {
      console.error("background retry failed:", err);
      await admin.from("platform_email_campaigns").update({ status: "failed" }).eq("id", campaignId);
    }
  })());

  return json({
    campaign_id: campaignId,
    retry: true,
    queued: true,
    template_slug: templateSlugFromBody,
    totals: { sent: 0, failed: missing.length, skipped: 0, pending: pairs.length },
    message: `Retry queued for ${pairs.length} failed recipient(s).`,
  });
}

// ─────────────────────────────────────────────────────────────
// Resend-to-unopened follow-up:
//   Given a parent campaign, build the audience of recipients who
//   were successfully sent to but whose tracking pixel never fired
//   (first_opened_at IS NULL). Exclude suppressions and anyone who
//   already received a follow-up of this campaign. When preview_only
//   is set we just return the counts + a sample; otherwise we create
//   a new child campaign row and dispatch via runDispatch.
// ─────────────────────────────────────────────────────────────
async function buildUnopenedAudience(
  admin: SupabaseAdmin,
  parentCampaignId: string,
): Promise<{
  tenantId: string | null;
  branches: BranchRow[];
  totals: {
    parent_sent: number;
    unopened: number;
    suppressed: number;
    already_followed_up: number;
    eligible: number;
  };
}> {
  // 1. Parent recipients that were sent + never opened + have a branch_id
  const { data: parentRecipients, error: recErr } = await admin
    .from("platform_email_campaign_recipients")
    .select("email, branch_id, first_opened_at, status")
    .eq("campaign_id", parentCampaignId);
  if (recErr) throw new Error(`parent_recipients: ${recErr.message}`);

  const parentRows = (parentRecipients ?? []) as Array<{
    email: string | null; branch_id: string | null;
    first_opened_at: string | null; status: string;
  }>;
  const sentRows = parentRows.filter((r) =>
    (r.status === "sent" || r.status === "completed" || r.status === "sent_existing_user")
    && !!r.branch_id && !!(r.email ?? "").trim()
  );
  const unopenedRows = sentRows.filter((r) => !r.first_opened_at);

  // 2. Suppressions
  const emailsLower = [...new Set(unopenedRows.map((r) => (r.email ?? "").toLowerCase()))];
  let suppressed = new Set<string>();
  if (emailsLower.length) {
    const { data: sup } = await admin
      .from("email_suppressions")
      .select("email")
      .in("email", emailsLower);
    suppressed = new Set(((sup ?? []) as Array<{ email: string }>).map((s) => s.email.toLowerCase()));
  }

  // 3. Already sent in a prior follow-up chain for this parent
  const { data: children } = await admin
    .from("platform_email_campaigns")
    .select("id")
    .eq("parent_campaign_id", parentCampaignId);
  const childIds = ((children ?? []) as Array<{ id: string }>).map((c) => c.id);
  const alreadyFollowed = new Set<string>();
  if (childIds.length) {
    const { data: childRecs } = await admin
      .from("platform_email_campaign_recipients")
      .select("branch_id")
      .in("campaign_id", childIds);
    for (const r of (childRecs ?? []) as Array<{ branch_id: string | null }>) {
      if (r.branch_id) alreadyFollowed.add(r.branch_id);
    }
  }

  const eligibleRows = unopenedRows.filter((r) =>
    !suppressed.has((r.email ?? "").toLowerCase())
    && !alreadyFollowed.has(r.branch_id!)
  );

  // 4. Resolve branch details (tenant scope for safety)
  const { data: parentCamp } = await admin
    .from("platform_email_campaigns")
    .select("tenant_id")
    .eq("id", parentCampaignId).maybeSingle();
  const tenantId = (parentCamp as { tenant_id: string | null } | null)?.tenant_id ?? null;

  let branches: BranchRow[] = [];
  if (tenantId && eligibleRows.length) {
    const wantedIds = new Set(eligibleRows.map((r) => r.branch_id!));
    const { data: allBranches } = await admin
      .from("branches")
      .select("id, name, email, slug, url_slug, trading_name")
      .eq("tenant_id", tenantId);
    branches = ((allBranches ?? []) as BranchRow[]).filter((b) => wantedIds.has(b.id));
  }

  const suppressedCount = unopenedRows.filter((r) =>
    suppressed.has((r.email ?? "").toLowerCase())
  ).length;
  const alreadyCount = unopenedRows.filter((r) =>
    !suppressed.has((r.email ?? "").toLowerCase()) && alreadyFollowed.has(r.branch_id!)
  ).length;

  return {
    tenantId,
    branches,
    totals: {
      parent_sent: sentRows.length,
      unopened: unopenedRows.length,
      suppressed: suppressedCount,
      already_followed_up: alreadyCount,
      eligible: branches.length,
    },
  };
}

async function handleResendUnopened(
  admin: SupabaseAdmin,
  callerId: string,
  callerOrigin: string | null,
  parentCampaignId: string,
  subjectOverride: string | null,
  previewOnly: boolean,
): Promise<Response> {
  const { data: parent, error: parentErr } = await admin
    .from("platform_email_campaigns")
    .select("id, tenant_id, template_slug, subject_snapshot, body_html_snapshot, body_text_snapshot, kind")
    .eq("id", parentCampaignId).maybeSingle();
  if (parentErr) return json({ error: `Parent lookup failed: ${parentErr.message}` }, 500);
  if (!parent) return json({ error: "Parent campaign not found" }, 404);
  if (!parent.tenant_id) return json({ error: "Parent campaign has no tenant" }, 400);
  if (parent.kind !== "marketing") {
    return json({ error: "Only marketing campaigns can be resent to unopened" }, 400);
  }

  const audience = await buildUnopenedAudience(admin, parentCampaignId);

  if (previewOnly) {
    return json({
      preview: true,
      parent_campaign_id: parentCampaignId,
      totals: audience.totals,
      sample: audience.branches.slice(0, 8).map((b) => ({ id: b.id, name: b.name, email: b.email })),
    });
  }

  if (!audience.branches.length) {
    return json({
      parent_campaign_id: parentCampaignId,
      totals: audience.totals,
      message: "No eligible unopened recipients to resend to.",
    });
  }

  const { data: tenant } = await admin
    .from("tenants").select("id, app_id, name, slug").eq("id", parent.tenant_id).maybeSingle();
  if (!tenant) return json({ error: "Tenant not found" }, 404);

  const resolved = await resolveAppOriginDetailed(admin, parent.tenant_id, callerOrigin);
  if (!resolved) return json({ error: "Could not resolve app origin" }, 500);
  const platformSenderId = await getPlatformSenderId(admin);

  const finalSubject = (subjectOverride ?? "").trim()
    || (parent.subject_snapshot.startsWith("Re: ")
      ? parent.subject_snapshot
      : `Re: ${parent.subject_snapshot}`);

  // Create child campaign row
  const { data: newCamp, error: newCampErr } = await admin
    .from("platform_email_campaigns")
    .insert({
      tenant_id: parent.tenant_id,
      template_slug: parent.template_slug,
      subject_snapshot: finalSubject,
      body_html_snapshot: parent.body_html_snapshot,
      body_text_snapshot: parent.body_text_snapshot,
      total_recipients: audience.branches.length,
      created_by: callerId,
      status: "running",
      kind: "marketing",
      parent_campaign_id: parentCampaignId,
    }).select("id").single();
  if (newCampErr) return json({ error: `Follow-up create failed: ${newCampErr.message}` }, 500);
  const campaignId = newCamp.id as string;

  // Insert pending recipient rows in bulk
  const pending: { branch: BranchRow; recipientId: string }[] = [];
  for (const c of chunk(audience.branches, INSERT_CHUNK)) {
    const payload = c.map((b) => ({
      campaign_id: campaignId,
      branch_id: b.id,
      email: (b.email ?? "").trim().toLowerCase(),
      status: "pending",
    }));
    const { data: inserted, error: insErr } = await admin
      .from("platform_email_campaign_recipients")
      .insert(payload)
      .select("id, branch_id");
    if (insErr) {
      await admin.from("platform_email_campaigns").update({
        status: "failed", failed_count: c.length,
      }).eq("id", campaignId);
      return json({ error: `Recipient insert failed: ${insErr.message}`, campaign_id: campaignId }, 500);
    }
    const byBranch = new Map<string, string>();
    for (const r of (inserted ?? []) as Array<{ branch_id: string; id: string }>) byBranch.set(r.branch_id, r.id);
    for (const b of c) {
      const rid = byBranch.get(b.id);
      if (rid) pending.push({ branch: b, recipientId: rid });
    }
  }

  const ctx: DispatchContext = {
    admin,
    template: {
      subject: finalSubject,
      body_html: parent.body_html_snapshot,
      body_text: parent.body_text_snapshot,
    },
    tenant,
    appOrigin: resolved.origin,
    campaignId,
    platformSenderId,
  };

  EdgeRuntime.waitUntil((async () => {
    try {
      await runDispatch(ctx, pending, 0);
    } catch (err) {
      console.error("follow-up dispatch failed:", err);
      try {
        await admin.from("platform_email_campaigns").update({ status: "failed" }).eq("id", campaignId);
      } catch { /* best-effort */ }
    }
  })());

  return json({
    campaign_id: campaignId,
    parent_campaign_id: parentCampaignId,
    queued: true,
    totals: { ...audience.totals, pending: pending.length },
    message: `Follow-up queued for ${pending.length} unopened recipient(s).`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration missing" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id)
      .eq("role", "platform_admin").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({})) as FunctionBody;
    const retryCampaignId = String(body.retry_campaign_id ?? body.campaign_id ?? "").trim();
    const templateSlug = String(body.template_slug ?? "marketing_branch_offer").trim();
    if (body.retry_failed === true) {
      if (!retryCampaignId) return json({ error: "retry_campaign_id required" }, 400);
      return await handleRetry(admin, retryCampaignId, templateSlug);
    }

    const tenant_id = String(body.tenant_id ?? "").trim();
    const branch_ids = normalizeBranchIds(body.branch_ids);
    const dryRun = body.dry_run === true;
    if (!tenant_id || !branch_ids.length) {
      return json({ error: "tenant_id and branch_ids required" }, 400);
    }

    const { data: template } = await admin
      .from("platform_email_templates").select("*").eq("slug", templateSlug).maybeSingle();
    if (!template) return json({ error: "Template not found" }, 404);
    if (template.kind !== "marketing") {
      return json({ error: "Template is not a marketing template" }, 400);
    }

    const { data: tenant } = await admin
      .from("tenants").select("id, app_id, name, slug").eq("id", tenant_id).maybeSingle();
    if (!tenant) return json({ error: "Tenant not found" }, 404);

    const { data: allBranches, error: branchesErr } = await admin
      .from("branches")
      .select("id, name, email, slug, url_slug, trading_name")
      .eq("tenant_id", tenant_id);
    if (branchesErr) {
      return json({ error: `Branch lookup failed: ${branchesErr.message}` }, 500);
    }
    const requestedSet = new Set(branch_ids);
    const resolvedBranches = ((allBranches ?? []) as BranchRow[]).filter((b) => requestedSet.has(b.id));
    const resolvedBranchIds = new Set(resolvedBranches.map((b) => b.id));
    const missingBranchIds = branch_ids.filter((id) => !resolvedBranchIds.has(id));

    if (!resolvedBranches.length) {
      return json({
        error: "No selected branches could be found for this tenant. Refresh the Communications page and try again.",
        requested_count: branch_ids.length,
        found_count: 0,
        missing_branch_ids: missingBranchIds,
        totals: { sent: 0, failed: 0, skipped: missingBranchIds.length },
        results: missingBranchIds.map((missingId) => ({
          branch_id: missingId,
          branch: "Unknown branch",
          email: null,
          status: "skipped_branch_not_found",
          error: "Branch was not found for the selected tenant",
        })),
      }, 400);
    }

    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
    const resolved = await resolveAppOriginDetailed(admin, tenant_id, callerOrigin);
    if (!resolved) return json({ error: "Could not resolve app origin" }, 500);
    const appOrigin = resolved.origin;
    const platformSenderId = await getPlatformSenderId(admin);

    const withEmail = resolvedBranches.filter((b) => (b.email ?? "").trim());
    const noEmail = resolvedBranches.filter((b) => !(b.email ?? "").trim());

    if (dryRun) {
      const results: Array<Record<string, unknown>> = [];
      for (const missingId of missingBranchIds) {
        results.push({
          branch_id: missingId,
          branch: "Unknown branch",
          status: "skipped_branch_not_found",
          error: "Branch was not found for the selected tenant",
        });
      }
      for (const b of noEmail) {
        results.push({ branch_id: b.id, branch: b.name, status: "skipped_no_email" });
      }
      let dryRunOk = 0;
      for (const b of withEmail) {
        const contactName = b.trading_name || b.name;
        const subject = renderTemplate(template.subject, {
          branch_name: b.name,
          contact_name: contactName,
          tenant_name: tenant.name,
          activation_link: `${appOrigin}/activate/…`,
        }, false);
        dryRunOk++;
        results.push({
          branch_id: b.id,
          branch: b.name,
          email: b.email,
          status: platformSenderId ? "dry_run_ok" : "dry_run_failed",
          subject,
          error: platformSenderId ? null : NO_PLATFORM_SENDER,
        });
      }
      return json({
        campaign_id: null,
        dry_run: true,
        requested_count: branch_ids.length,
        found_count: resolvedBranches.length,
        missing_branch_ids: missingBranchIds,
        totals: {
          sent: 0,
          failed: platformSenderId ? 0 : withEmail.length,
          skipped: missingBranchIds.length + noEmail.length,
          dry_run_ok: platformSenderId ? dryRunOk : 0,
        },
        results,
      });
    }

    const { data: campaign, error: campErr } = await admin
      .from("platform_email_campaigns")
      .insert({
        tenant_id,
        template_slug: templateSlug,
        subject_snapshot: template.subject,
        body_html_snapshot: template.body_html,
        body_text_snapshot: template.body_text,
        total_recipients: resolvedBranches.length,
        created_by: caller.id,
        status: "running",
        kind: "marketing",
      }).select("id").single();
    if (campErr) return json({ error: `Campaign create failed: ${campErr.message}` }, 500);
    const campaignId = campaign.id as string;

    let skipped = 0;
    if (missingBranchIds.length) {
      const rows = missingBranchIds.map((missingId) => ({
        campaign_id: campaignId,
        branch_id: null,
        email: null,
        status: "skipped_branch_not_found",
        error: `Branch ${missingId} was not found for tenant ${tenant_id}`,
      }));
      for (const c of chunk(rows, INSERT_CHUNK)) await admin.from("platform_email_campaign_recipients").insert(c);
      skipped += missingBranchIds.length;
    }

    if (noEmail.length) {
      const rows = noEmail.map((b) => ({
        campaign_id: campaignId,
        branch_id: b.id,
        email: null,
        status: "skipped_no_email",
      }));
      for (const c of chunk(rows, INSERT_CHUNK)) await admin.from("platform_email_campaign_recipients").insert(c);
      skipped += noEmail.length;
    }

    const pending: { branch: BranchRow; recipientId: string }[] = [];
    for (const c of chunk(withEmail, INSERT_CHUNK)) {
      const payload = c.map((b) => ({
        campaign_id: campaignId,
        branch_id: b.id,
        email: (b.email ?? "").trim().toLowerCase(),
        status: "pending",
      }));
      const { data: inserted, error: insErr } = await admin
        .from("platform_email_campaign_recipients")
        .insert(payload)
        .select("id, branch_id");
      if (insErr) {
        await admin.from("platform_email_campaigns").update({
          status: "failed",
          failed_count: c.length,
        }).eq("id", campaignId);
        return json({ error: `Recipient insert failed: ${insErr.message}`, campaign_id: campaignId }, 500);
      }
      const byBranch = new Map<string, string>();
      for (const r of (inserted ?? []) as Array<{ branch_id: string; id: string }>) byBranch.set(r.branch_id, r.id);
      for (const b of c) {
        const rid = byBranch.get(b.id);
        if (rid) pending.push({ branch: b, recipientId: rid });
      }
    }

    const ctx: DispatchContext = {
      admin,
      template,
      tenant,
      appOrigin,
      campaignId,
      platformSenderId,
    };

    if (pending.length <= SYNC_LIMIT) {
      const { queued, failed, preparedFailed } = await runDispatch(ctx, pending, skipped);
      const results: Array<Record<string, unknown>> = [];
      for (const p of preparedFailed) {
        results.push({
          branch_id: p.branch.id,
          branch: p.branch.name,
          email: p.branch.email,
          status: "failed",
          error: p.error,
          activation_link: p.activationLink,
        });
      }
      for (const missingId of missingBranchIds) {
        results.push({ branch_id: missingId, branch: "Unknown branch", status: "skipped_branch_not_found" });
      }
      for (const b of noEmail) results.push({ branch_id: b.id, branch: b.name, status: "skipped_no_email" });

      return json({
        campaign_id: campaignId,
        dry_run: false,
        queued: false,
        requested_count: branch_ids.length,
        found_count: resolvedBranches.length,
        missing_branch_ids: missingBranchIds,
        totals: { sent: queued, failed, skipped, dry_run_ok: 0 },
        results,
      });
    }

    EdgeRuntime.waitUntil((async () => {
      try {
        await runDispatch(ctx, pending, skipped);
      } catch (err) {
        console.error("background dispatch failed:", err);
        try {
          await admin.from("platform_email_campaigns").update({ status: "failed" }).eq("id", campaignId);
        } catch { /* best-effort */ }
      }
    })());

    return json({
      campaign_id: campaignId,
      dry_run: false,
      queued: true,
      requested_count: branch_ids.length,
      found_count: resolvedBranches.length,
      missing_branch_ids: missingBranchIds,
      totals: { sent: 0, failed: 0, skipped, dry_run_ok: 0, pending: pending.length },
      results: [],
      message: `Queued ${pending.length} email(s) for background preparation. Progress will update in the campaign card.`,
    });
  } catch (e) {
    console.error("send-branch-marketing-campaign error:", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});