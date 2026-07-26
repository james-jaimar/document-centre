// Bulk-sends the Document Centre "marketing" email to selected branches.
//
// For campaigns larger than SYNC_LIMIT recipients we return immediately after
// creating the campaign + pending recipient rows and dispatch in the
// background via EdgeRuntime.waitUntil(). The client polls
// platform_email_campaigns / platform_email_campaign_recipients for progress.
//
// send-email itself just enqueues into public.email_outbox — the actual SMTP
// / Microsoft Graph send happens in the Python worker with its own per-account
// concurrency cap, so we don't need throttling here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOriginDetailed } from "../_shared/buildAuthLink.ts";
import { renderTemplate } from "../_shared/sendBranchActivation.ts";
import { renderBrandedEmail, renderBrandedText } from "../_shared/branded-shell.ts";
import { htmlToText, deriveSnippet } from "../_shared/htmlToText.ts";
import { appendTrackingPixel } from "../_shared/emailTracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Below this size we run synchronously so the admin gets full per-recipient
// results in the response. Above it we return immediately and dispatch in the
// background. Keep this low enough to comfortably fit in the edge function
// wall-clock budget for the synchronous path.
const SYNC_LIMIT = 25;
const DISPATCH_CONCURRENCY = 8;
const RECIPIENT_INSERT_CHUNK = 500;

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

interface BranchRow {
  id: string;
  name: string;
  email: string | null;
  slug: string | null;
  url_slug: string | null;
  trading_name: string | null;
}

interface DispatchContext {
  admin: ReturnType<typeof createClient>;
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  template: any;
  tenant: { id: string; app_id: string | null; name: string; slug: string | null };
  appOrigin: string;
  platformSenderPresent: boolean;
  campaignId: string;
}

const NO_PLATFORM_SENDER =
  "Platform sender mailbox not configured — connect one under Platform → Settings → Email.";

async function sendOneRecipient(
  ctx: DispatchContext,
  branch: BranchRow,
  recipientId: string,
): Promise<{ status: "sent" | "failed"; error?: string; action_link?: string }> {
  const email = (branch.email ?? "").trim().toLowerCase();
  const contactName = branch.trading_name || branch.name;
  try {
    // Upsert activation page (idempotent — reuse existing slug)
    const { data: existingPage } = await ctx.admin
      .from("platform_branch_activation_pages")
      .select("slug").eq("branch_id", branch.id).maybeSingle();
    let pageSlug = existingPage?.slug ?? null;
    if (!pageSlug) {
      pageSlug = mintSlug();
      const { error: insertPageErr } = await ctx.admin
        .from("platform_branch_activation_pages").insert({
          tenant_id: ctx.tenant.id, branch_id: branch.id, app_id: ctx.tenant.app_id,
          slug: pageSlug, contact_email: email, contact_name: contactName,
        });
      if (insertPageErr) throw new Error(`activation_page_insert: ${insertPageErr.message}`);
    } else {
      const { error: updatePageErr } = await ctx.admin
        .from("platform_branch_activation_pages")
        .update({ contact_email: email, contact_name: contactName, is_active: true })
        .eq("branch_id", branch.id);
      if (updatePageErr) throw new Error(`activation_page_update: ${updatePageErr.message}`);
    }

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

    // Persist the action_link on the recipient row up-front so the UI can
    // show it even before the send completes.
    await ctx.admin.from("platform_email_campaign_recipients").update({
      action_link: activationLink, status: "sending",
    }).eq("id", recipientId);

    if (!ctx.platformSenderPresent) {
      await ctx.admin.from("platform_email_campaign_recipients").update({
        status: "failed", error: NO_PLATFORM_SENDER,
      }).eq("id", recipientId);
      return { status: "failed", error: NO_PLATFORM_SENDER, action_link: activationLink };
    }

    const trackedHtml = await appendTrackingPixel(html, ctx.campaignId, recipientId, null);

    const sendResp = await fetch(`${ctx.supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ctx.authHeader,
        apikey: ctx.anonKey,
      },
      body: JSON.stringify({
        to: email, subject, html: trackedHtml, text,
        tenant_id: null, branch_id: null, app_id: ctx.tenant.app_id ?? null,
        from_name: `${ctx.tenant.name} via Document Centre`,
        category: "system",
        related_type: "branch_marketing",
        related_id: branch.id,
        metadata: {
          tenant_id: ctx.tenant.id, branch_id: branch.id,
          campaign_id: ctx.campaignId, recipient_id: recipientId,
          kind: "branch_marketing",
        },
      }),
    });
    const sendText = await sendResp.text();
    let sendBody: any = null;
    try { sendBody = JSON.parse(sendText); } catch { /* not JSON */ }
    if (!sendResp.ok) {
      const msg = `send-email ${sendResp.status}: ${sendText.slice(0, 500)}`;
      await ctx.admin.from("platform_email_campaign_recipients").update({
        status: "failed", error: msg,
      }).eq("id", recipientId);
      return { status: "failed", error: msg, action_link: activationLink };
    }
    if (sendBody?.error === "EMAIL_NOT_CONFIGURED") {
      await ctx.admin.from("platform_email_campaign_recipients").update({
        status: "failed", error: NO_PLATFORM_SENDER,
      }).eq("id", recipientId);
      return { status: "failed", error: NO_PLATFORM_SENDER, action_link: activationLink };
    }

    await ctx.admin.from("platform_email_campaign_recipients").update({
      status: "sent", sent_at: new Date().toISOString(),
    }).eq("id", recipientId);
    return { status: "sent", action_link: activationLink };
  } catch (e) {
    const msg = (e as Error).message ?? "unknown";
    try {
      await ctx.admin.from("platform_email_campaign_recipients").update({
        status: "failed", error: msg,
      }).eq("id", recipientId);
    } catch { /* best-effort */ }
    return { status: "failed", error: msg };
  }
}

async function dispatchCampaign(
  ctx: DispatchContext,
  pairs: { branch: BranchRow; recipientId: string }[],
): Promise<{ sent: number; failed: number; perResults: any[] }> {
  let sent = 0, failed = 0;
  const perResults: any[] = [];
  const batches = chunk(pairs, DISPATCH_CONCURRENCY);
  for (const batch of batches) {
    const settled = await Promise.all(
      batch.map(async ({ branch, recipientId }) => ({
        branch,
        recipientId,
        outcome: await sendOneRecipient(ctx, branch, recipientId),
      })),
    );
    for (const s of settled) {
      if (s.outcome.status === "sent") sent++; else failed++;
      perResults.push({
        branch_id: s.branch.id,
        branch: s.branch.name,
        email: s.branch.email,
        status: s.outcome.status,
        error: s.outcome.error,
        activation_link: s.outcome.action_link,
      });
    }
    // Rolling progress update so the admin UI sees the campaign advance.
    try {
      await ctx.admin.from("platform_email_campaigns").update({
        sent_count: sent, failed_count: failed,
      }).eq("id", ctx.campaignId);
    } catch { /* best-effort */ }
  }
  return { sent, failed, perResults };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const body = await req.json().catch(() => ({}));
    const tenant_id = String(body.tenant_id ?? "").trim();
    const template_slug = String(body.template_slug ?? "marketing_branch_offer").trim();
    const branch_ids = normalizeBranchIds(body.branch_ids);
    const dryRun = body.dry_run === true;
    if (!tenant_id || !branch_ids.length) {
      return json({ error: "tenant_id and branch_ids required" }, 400);
    }

    const { data: template } = await admin
      .from("platform_email_templates").select("*").eq("slug", template_slug).maybeSingle();
    if (!template) return json({ error: "Template not found" }, 404);
    if (template.kind !== "marketing") {
      return json({ error: "Template is not a marketing template" }, 400);
    }

    const { data: tenant } = await admin
      .from("tenants").select("id, app_id, name, slug").eq("id", tenant_id).maybeSingle();
    if (!tenant) return json({ error: "Tenant not found" }, 404);

    // Load branches for the tenant in one round trip and filter in memory.
    // Avoids PostgREST URL-length limits with a huge `.in(id, [...])` filter.
    const { data: allBranches, error: branchesErr } = await admin
      .from("branches")
      .select("id, name, email, slug, url_slug, trading_name")
      .eq("tenant_id", tenant_id);
    if (branchesErr) {
      return json({ error: `Branch lookup failed: ${branchesErr.message}` }, 500);
    }
    const requestedSet = new Set(branch_ids);
    const resolvedBranches = (allBranches ?? []).filter((b: any) => requestedSet.has(b.id)) as BranchRow[];
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
          branch_id: missingId, branch: "Unknown branch", email: null,
          status: "skipped_branch_not_found",
          error: "Branch was not found for the selected tenant",
        })),
      }, 400);
    }

    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
    const resolved = await resolveAppOriginDetailed(admin, tenant_id, callerOrigin);
    if (!resolved) return json({ error: "Could not resolve app origin" }, 500);
    const appOrigin = resolved.origin;

    // Preflight: marketing emails send from the platform sender.
    const { data: platformSender } = await admin
      .from("email_accounts").select("id")
      .is("tenant_id", null).is("branch_id", null)
      .eq("is_active", true).limit(1).maybeSingle();
    const platformSenderPresent = !!platformSender;

    // Separate branches with vs without email.
    const withEmail = resolvedBranches.filter((b) => (b.email ?? "").trim());
    const noEmail = resolvedBranches.filter((b) => !(b.email ?? "").trim());

    // ---------- DRY RUN ----------
    if (dryRun) {
      const results: any[] = [];
      for (const missingId of missingBranchIds) {
        results.push({
          branch_id: missingId, branch: "Unknown branch",
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
          branch_name: b.name, contact_name: contactName,
          tenant_name: tenant.name, activation_link: `${appOrigin}/activate/…`,
        }, false);
        dryRunOk++;
        results.push({
          branch_id: b.id, branch: b.name, email: b.email,
          status: "dry_run_ok", subject,
        });
      }
      return json({
        campaign_id: null, dry_run: true,
        requested_count: branch_ids.length,
        found_count: resolvedBranches.length,
        missing_branch_ids: missingBranchIds,
        totals: { sent: 0, failed: 0, skipped: missingBranchIds.length + noEmail.length, dry_run_ok: dryRunOk },
        results,
      });
    }

    // ---------- REAL SEND ----------
    const { data: campaign, error: campErr } = await admin
      .from("platform_email_campaigns").insert({
        tenant_id, template_slug,
        subject_snapshot: template.subject,
        body_html_snapshot: template.body_html,
        body_text_snapshot: template.body_text,
        total_recipients: resolvedBranches.length,
        created_by: caller.id, status: "running",
        kind: "marketing",
      }).select("id").single();
    if (campErr) return json({ error: `Campaign create failed: ${campErr.message}` }, 500);
    const campaignId = campaign.id as string;

    let skipped = 0;

    // Record skipped-missing rows.
    if (missingBranchIds.length) {
      const rows = missingBranchIds.map((missingId) => ({
        campaign_id: campaignId, branch_id: null, email: null,
        status: "skipped_branch_not_found",
        error: `Branch ${missingId} was not found for tenant ${tenant_id}`,
      }));
      for (const c of chunk(rows, RECIPIENT_INSERT_CHUNK)) {
        await admin.from("platform_email_campaign_recipients").insert(c);
      }
      skipped += missingBranchIds.length;
    }

    // Record skipped-no-email rows.
    if (noEmail.length) {
      const rows = noEmail.map((b) => ({
        campaign_id: campaignId, branch_id: b.id, email: null,
        status: "skipped_no_email",
      }));
      for (const c of chunk(rows, RECIPIENT_INSERT_CHUNK)) {
        await admin.from("platform_email_campaign_recipients").insert(c);
      }
      skipped += noEmail.length;
    }

    // Bulk-insert pending recipients (with email) — one round trip per chunk —
    // and capture their ids for the dispatch loop.
    const pending: { branch: BranchRow; recipientId: string }[] = [];
    for (const c of chunk(withEmail, RECIPIENT_INSERT_CHUNK)) {
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
        return json({
          error: `Recipient insert failed: ${insErr.message}`,
          campaign_id: campaignId,
        }, 500);
      }
      const byBranch = new Map<string, string>();
      for (const r of inserted ?? []) byBranch.set((r as any).branch_id, (r as any).id);
      for (const b of c) {
        const rid = byBranch.get(b.id);
        if (rid) pending.push({ branch: b, recipientId: rid });
      }
    }

    const ctx: DispatchContext = {
      admin, supabaseUrl: url, anonKey, authHeader,
      template, tenant, appOrigin, platformSenderPresent, campaignId,
    };

    // ---------- SYNCHRONOUS PATH (small campaigns) ----------
    if (pending.length <= SYNC_LIMIT) {
      const { sent, failed, perResults } = await dispatchCampaign(ctx, pending);
      // Merge skipped result rows for parity with the previous response shape.
      const results: any[] = perResults.slice();
      for (const missingId of missingBranchIds) {
        results.push({
          branch_id: missingId, branch: "Unknown branch",
          status: "skipped_branch_not_found",
          error: "Branch was not found for the selected tenant",
        });
      }
      for (const b of noEmail) {
        results.push({ branch_id: b.id, branch: b.name, status: "skipped_no_email" });
      }
      await admin.from("platform_email_campaigns").update({
        sent_count: sent, failed_count: failed,
        skipped_count: skipped, status: "completed",
      }).eq("id", campaignId);
      return json({
        campaign_id: campaignId,
        dry_run: false,
        queued: false,
        requested_count: branch_ids.length,
        found_count: resolvedBranches.length,
        missing_branch_ids: missingBranchIds,
        totals: { sent, failed, skipped, dry_run_ok: 0 },
        results,
      });
    }

    // ---------- BACKGROUND PATH (large campaigns) ----------
    // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime.
    EdgeRuntime.waitUntil((async () => {
      try {
        const { sent, failed } = await dispatchCampaign(ctx, pending);
        await admin.from("platform_email_campaigns").update({
          sent_count: sent, failed_count: failed,
          skipped_count: skipped, status: "completed",
        }).eq("id", campaignId);
      } catch (err) {
        console.error("background dispatch failed:", err);
        try {
          await admin.from("platform_email_campaigns").update({
            status: "failed",
          }).eq("id", campaignId);
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
      totals: {
        sent: 0, failed: 0,
        skipped, dry_run_ok: 0,
        pending: pending.length,
      },
      results: [],
      message: `Queued ${pending.length} email(s) for background sending. Progress will update in the campaign card.`,
    });
  } catch (e) {
    console.error("send-branch-marketing-campaign error:", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
