// Cron-invoked: scans active campaign triggers and dispatches follow-up emails
// to recipients who matched the condition (not_opened / not_clicked /
// not_activated) more than `delay_hours` after their initial send, up to
// `max_follow_ups`. Safe to run frequently (e.g. every 30 min) — idempotent
// via follow_up_count and last_follow_up_at.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { renderTemplate } from "../_shared/sendBranchActivation.ts";
import { renderBrandedEmail, renderBrandedText, escapeHtml } from "../_shared/branded-shell.ts";
import { injectTracking } from "../_shared/emailTracking.ts";
import { resolveAppOriginDetailed } from "../_shared/buildAuthLink.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const { data: triggers } = await admin
    .from("platform_campaign_triggers")
    .select("*").eq("enabled", true);

  let processed = 0, dispatched = 0, errors = 0;
  const log: any[] = [];

  for (const trig of triggers ?? []) {
    // Find candidate campaigns this trigger applies to
    let campQuery = admin.from("platform_email_campaigns").select("*");
    if (trig.campaign_id) campQuery = campQuery.eq("id", trig.campaign_id);
    if (trig.template_slug && !trig.campaign_id) campQuery = campQuery.eq("template_slug", trig.template_slug);
    const { data: campaigns } = await campQuery;

    for (const camp of campaigns ?? []) {
      const cutoff = new Date(Date.now() - trig.delay_hours * 3600 * 1000).toISOString();
      const { data: recipients } = await admin
        .from("platform_email_campaign_recipients")
        .select("*")
        .eq("campaign_id", camp.id)
        .eq("status", "sent")
        .lte("sent_at", cutoff)
        .lt("follow_up_count", trig.max_follow_ups);

      for (const r of recipients ?? []) {
        processed++;
        // Evaluate condition
        let qualifies = false;
        if (trig.condition === "not_opened") qualifies = !r.first_opened_at;
        else if (trig.condition === "not_clicked") qualifies = !r.first_clicked_at;
        else if (trig.condition === "not_activated") qualifies = !r.activated_at;
        if (!qualifies) continue;

        try {
          // Load follow-up template
          const { data: template } = await admin
            .from("platform_email_templates").select("*")
            .eq("slug", trig.action_template_slug).maybeSingle();
          if (!template) throw new Error(`template_not_found:${trig.action_template_slug}`);

          // Load branch + tenant for token substitution
          const { data: branch } = await admin
            .from("branches").select("id, name, email, trading_name, tenant_id, slug, url_slug")
            .eq("id", r.branch_id).maybeSingle();
          if (!branch) throw new Error("branch_missing");
          const { data: tenant } = await admin
            .from("tenants").select("id, name, slug").eq("id", branch.tenant_id).maybeSingle();
          if (!tenant) throw new Error("tenant_missing");

          // Reuse activation page link if available
          const { data: actPage } = await admin
            .from("platform_branch_activation_pages").select("slug").eq("branch_id", branch.id).maybeSingle();
          const resolved = await resolveAppOriginDetailed(admin, tenant.id, null);
          const origin = resolved?.origin ?? "https://document-centre.com";
          const activationLink = actPage?.slug ? `${origin}/activate/${actPage.slug}` : (r.action_link ?? "");

          const vars: Record<string, string> = {
            branch_name: branch.name,
            contact_name: branch.trading_name || branch.name,
            tenant_name: tenant.name,
            activation_link: activationLink,
            action_link: r.action_link ?? activationLink,
            login_email: r.email ?? "",
            store_url: origin,
            portal_name: tenant.name,
          };
          const subject = renderTemplate(template.subject, vars, false);
          const htmlBody = renderTemplate(template.body_html, vars, true);
          const textBody = template.body_text ? renderTemplate(template.body_text, vars, false) : "";
          const wrappedHtml = renderBrandedEmail({
            preheader: `Follow-up for ${escapeHtml(branch.name)}`,
            heading: subject, bodyHtml: htmlBody,
          });
          const tracked = await injectTracking(wrappedHtml, camp.id, r.id, origin);
          const text = renderBrandedText({ heading: subject, bodyText: textBody });

          // Send via service-role: use anon as bearer
          const sendResp = await fetch(`${url}/functions/v1/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
            body: JSON.stringify({ to: r.email, subject, html: tracked, text }),
          });
          if (!sendResp.ok) throw new Error(`send-email ${sendResp.status}`);

          await admin.from("platform_email_campaign_recipients").update({
            follow_up_count: (r.follow_up_count ?? 0) + 1,
            last_follow_up_at: new Date().toISOString(),
          }).eq("id", r.id);
          dispatched++;
          log.push({ recipient_id: r.id, email: r.email, trigger_id: trig.id, status: "sent" });
        } catch (e) {
          errors++;
          log.push({ recipient_id: r.id, trigger_id: trig.id, status: "failed", error: (e as Error).message });
        }
      }
    }
  }

  return json({ processed, dispatched, errors, log });
});
