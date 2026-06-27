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
import { injectTracking } from "../_shared/emailTracking.ts";

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
    const branch_ids: string[] = Array.isArray(body.branch_ids) ? body.branch_ids : [];
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

    const { data: branches } = await admin
      .from("branches")
      .select("id, name, email, slug, url_slug, trading_name, app_id")
      .eq("tenant_id", tenant_id).in("id", branch_ids);

    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
    const resolved = await resolveAppOriginDetailed(admin, tenant_id, callerOrigin);
    if (!resolved) return json({ error: "Could not resolve app origin" }, 500);
    const appOrigin = resolved.origin;

    let campaignId: string | null = null;
    if (!dryRun) {
      const { data: campaign, error: campErr } = await admin
        .from("platform_email_campaigns").insert({
          tenant_id, template_slug,
          subject_snapshot: template.subject,
          body_html_snapshot: template.body_html,
          body_text_snapshot: template.body_text,
          total_recipients: branches?.length ?? 0,
          created_by: caller.id, status: "running",
          kind: "marketing",
        }).select("id").single();
      if (campErr) return json({ error: `Campaign create failed: ${campErr.message}` }, 500);
      campaignId = campaign.id;
    }

    const results: any[] = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const b of branches ?? []) {
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
          await admin.from("platform_branch_activation_pages").insert({
            tenant_id, branch_id: b.id, app_id: b.app_id ?? tenant.app_id,
            slug: pageSlug, contact_email: email, contact_name: contactName,
            created_by: caller.id,
          });
        } else {
          // Refresh contact details in case admin updated branch
          await admin.from("platform_branch_activation_pages")
            .update({ contact_email: email, contact_name: contactName, is_active: true })
            .eq("branch_id", b.id);
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
        const textBody = template.body_text ? renderTemplate(template.body_text, vars, false) : "";

        // Wrap in Document Centre branded shell (marketing = platform-branded, not tenant)
        const html = renderBrandedEmail({
          preheader: `Activate your ${escapeHtml(b.name)} storefront`,
          heading: subject,
          bodyHtml: htmlBody,
        });
        const text = renderBrandedText({ heading: subject, bodyText: textBody });

        if (dryRun) {
          results.push({ branch_id: b.id, branch: b.name, email, status: "dry_run_ok", subject, activation_link: activationLink });
          continue;
        }

        const sendResp = await fetch(`${url}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
          body: JSON.stringify({ to: email, subject, html, text }),
        });
        if (!sendResp.ok) {
          const t = await sendResp.text();
          throw new Error(`send-email ${sendResp.status}: ${t}`);
        }

        sent++;
        await admin.from("platform_email_campaign_recipients").insert({
          campaign_id: campaignId, branch_id: b.id, email,
          status: "sent", action_link: activationLink, sent_at: new Date().toISOString(),
        });
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

    return json({ campaign_id: campaignId, dry_run: dryRun, totals: { sent, failed, skipped }, results });
  } catch (e) {
    console.error("send-branch-marketing-campaign error:", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
