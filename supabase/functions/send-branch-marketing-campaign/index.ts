// Bulk-sends the Document Centre "marketing" email to selected branches.
// For each branch we upsert a platform_branch_activation_pages row (creating
// an opaque per-branch slug if needed) and email an unsigned marketing pitch
// containing the per-branch /activate/<slug> link. No credentials, no
// onboarding tokens. The credential-bearing activation email is only sent
// when the recipient self-confirms on the activation page.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOriginDetailed } from "../_shared/buildAuthLink.ts";
import { renderTemplate } from "../_shared/sendBranchActivation.ts";
import { renderBrandedEmail, renderBrandedText, escapeHtml } from "../_shared/branded-shell.ts";
import { htmlToText, deriveSnippet } from "../_shared/htmlToText.ts";
import { appendTrackingPixel } from "../_shared/emailTracking.ts";

// No hero image — admins insert their own images via the template editor.



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
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
    if (!tenant_id || !branch_ids.length) return json({ error: "tenant_id and branch_ids required" }, 400);

    const { data: template } = await admin
      .from("platform_email_templates").select("*").eq("slug", template_slug).maybeSingle();
    if (!template) return json({ error: "Template not found" }, 404);
    if (template.kind !== "marketing") {
      return json({ error: "Template is not a marketing template" }, 400);
    }

    const { data: tenant } = await admin
      .from("tenants").select("id, app_id, name, slug").eq("id", tenant_id).maybeSingle();
    if (!tenant) return json({ error: "Tenant not found" }, 404);

    const { data: branches, error: branchesErr } = await admin
      .from("branches")
      .select("id, name, email, slug, url_slug, trading_name")
      .eq("tenant_id", tenant_id).in("id", branch_ids);

    if (branchesErr) {
      return json({ error: `Branch lookup failed: ${branchesErr.message}` }, 500);
    }

    const resolvedBranches = branches ?? [];
    const resolvedBranchIds = new Set(resolvedBranches.map((branch: any) => branch.id));
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

    // Preflight: marketing/activation emails send from the platform sender.
    const { data: platformSender } = await admin
      .from("email_accounts")
      .select("id")
      .is("tenant_id", null)
      .is("branch_id", null)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const NO_PLATFORM_SENDER = "Platform sender mailbox not configured — connect one under Platform → Settings → Email.";

    let campaignId: string | null = null;
    if (!dryRun) {
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
      campaignId = campaign.id;
    }

    const results: any[] = [];
    let sent = 0, failed = 0, skipped = 0, dryRunOk = 0;

    for (const missingId of missingBranchIds) {
      skipped++;
      results.push({ branch_id: missingId, branch: "Unknown branch", status: "skipped_branch_not_found", error: "Branch was not found for the selected tenant" });
      if (campaignId) await admin.from("platform_email_campaign_recipients").insert({
        campaign_id: campaignId, branch_id: null, email: null, status: "skipped_branch_not_found", error: `Branch ${missingId} was not found for tenant ${tenant_id}`,
      });
    }

    for (const b of resolvedBranches) {
      const email = (b.email ?? "").trim().toLowerCase();
      const contactName = b.trading_name || b.name;
      if (!email) {
        skipped++;
        results.push({ branch_id: b.id, branch: b.name, status: "skipped_no_email" });
        if (campaignId) await admin.from("platform_email_campaign_recipients").insert({
          campaign_id: campaignId, branch_id: b.id, email: null, status: "skipped_no_email",
        });
        continue;
      }

      try {
        // Upsert activation page (idempotent — reuse existing slug)
        const { data: existingPage } = await admin
          .from("platform_branch_activation_pages")
          .select("slug").eq("branch_id", b.id).maybeSingle();
        let pageSlug = existingPage?.slug ?? null;
        if (!pageSlug) {
          pageSlug = mintSlug();
          const { error: insertPageErr } = await admin.from("platform_branch_activation_pages").insert({
            tenant_id, branch_id: b.id, app_id: tenant.app_id,
            slug: pageSlug, contact_email: email, contact_name: contactName,
            created_by: caller.id,
          });
          if (insertPageErr) throw new Error(`activation_page_insert: ${insertPageErr.message}`);
        } else {
          // Refresh contact details in case admin updated branch
          const { error: updatePageErr } = await admin.from("platform_branch_activation_pages")
            .update({ contact_email: email, contact_name: contactName, is_active: true })
            .eq("branch_id", b.id);
          if (updatePageErr) throw new Error(`activation_page_update: ${updatePageErr.message}`);
        }

        const activationLink = `${appOrigin}/activate/${pageSlug}`;

        const vars: Record<string, string> = {
          branch_name: b.name,
          contact_name: contactName,
          tenant_name: tenant.name,
          activation_link: activationLink,
        };

        const subject = renderTemplate(template.subject, vars, false);
        const htmlBody = renderTemplate(template.body_html, vars, true);
        const textBody = template.body_text
          ? renderTemplate(template.body_text, vars, false)
          : htmlToText(htmlBody);
        const preheader = deriveSnippet(textBody)
          || `Activate your ${b.name} storefront on ${tenant.name}.`;

        // Wrap in Document Centre branded shell.
        // For marketing emails we deliberately:
        //   - hide Privacy/Terms footer links (clutter, and not relevant
        //     before the recipient has even signed up)
        //   - point the footer "site" link at the tenant origin too
        //   - skip click/open tracking entirely so every <a href> in the
        //     final HTML is a plain direct URL (no supabase.co anywhere).
        //     We measure success by activations on /activate/<slug>, which
        //     is far more meaningful than open/click pixels.
        // No hero image is injected — admins add their own images directly
        // in the template editor when they want a header banner.
        const html = renderBrandedEmail({
          preheader,
          heading: subject,
          bodyHtml: htmlBody,
          hideLegalLinks: true,
          siteLinkUrl: appOrigin,
          siteLinkLabel: appOrigin.replace(/^https?:\/\//, ""),
        });

        const text = renderBrandedText({
          heading: subject,
          bodyText: textBody,
          siteLinkUrl: appOrigin,
        });

        if (dryRun) {
          dryRunOk++;
          results.push({ branch_id: b.id, branch: b.name, email, status: "dry_run_ok", subject, activation_link: activationLink });
          continue;
        }

        // Insert recipient row first so we have an id for reporting.
        const { data: rcpt, error: rcptErr } = await admin
          .from("platform_email_campaign_recipients").insert({
            campaign_id: campaignId, branch_id: b.id, email,
            status: "pending", action_link: activationLink,
          }).select("id").single();
        if (rcptErr || !rcpt) throw new Error(`recipient_insert: ${rcptErr?.message}`);

        // Inject a 1x1 open-pixel only; leave <a href> URLs untouched so the
        // branded activation link stays a clean direct URL. This gives us
        // "at least this many opened" telemetry without polluting visible links.
        const trackedHtml = await appendTrackingPixel(html, campaignId, rcpt.id, null);

        if (!platformSender) {
          await admin.from("platform_email_campaign_recipients").update({
            status: "failed", error: NO_PLATFORM_SENDER,
          }).eq("id", rcpt.id);
          throw new Error(NO_PLATFORM_SENDER);
        }

        const sendResp = await fetch(`${url}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
          body: JSON.stringify({
            to: email, subject, html: trackedHtml, text,
            // Platform-scope send (Document Centre marketing to prospective branches).
            tenant_id: null, branch_id: null, app_id: tenant.app_id ?? null,
            from_name: `${tenant.name} via Document Centre`,
            category: "system",
            related_type: "branch_marketing",
            related_id: b.id,
            metadata: { tenant_id, branch_id: b.id, campaign_id: campaignId, recipient_id: rcpt.id, kind: "branch_marketing" },
          }),
        });
        const sendText = await sendResp.text();
        let sendBody: any = null;
        try { sendBody = JSON.parse(sendText); } catch { /* not JSON */ }
        if (!sendResp.ok) {
          await admin.from("platform_email_campaign_recipients").update({
            status: "failed", error: `send-email ${sendResp.status}: ${sendText}`,
          }).eq("id", rcpt.id);
          throw new Error(`send-email ${sendResp.status}: ${sendText}`);
        }
        if (sendBody?.error === "EMAIL_NOT_CONFIGURED") {
          await admin.from("platform_email_campaign_recipients").update({
            status: "failed", error: NO_PLATFORM_SENDER,
          }).eq("id", rcpt.id);
          throw new Error(NO_PLATFORM_SENDER);
        }

        sent++;
        await admin.from("platform_email_campaign_recipients").update({
          status: "sent", sent_at: new Date().toISOString(),
        }).eq("id", rcpt.id);
        results.push({ branch_id: b.id, branch: b.name, email, status: "sent", activation_link: activationLink });
      } catch (e) {
        failed++;
        const msg = (e as Error).message ?? "unknown";
        if (campaignId) await admin.from("platform_email_campaign_recipients").insert({
          campaign_id: campaignId, branch_id: b.id, email, status: "failed", error: msg,
        });
        results.push({ branch_id: b.id, branch: b.name, email, status: "failed", error: msg });
      }
    }

    if (campaignId) {
      await admin.from("platform_email_campaigns").update({
        sent_count: sent, failed_count: failed, skipped_count: skipped, status: "completed",
      }).eq("id", campaignId);
    }

    return json({
      campaign_id: campaignId,
      dry_run: dryRun,
      requested_count: branch_ids.length,
      found_count: resolvedBranches.length,
      missing_branch_ids: missingBranchIds,
      totals: { sent, failed, skipped, dry_run_ok: dryRunOk },
      results,
    });
  } catch (e) {
    console.error("send-branch-marketing-campaign error:", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
