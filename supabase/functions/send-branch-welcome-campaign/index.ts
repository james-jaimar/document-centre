// Platform Communications: bulk-send a templated welcome email to one or
// many branches in a tenant. For each branch we ensure a branch_manager
// auth user + membership exist, generate a one-time recovery link (the
// "temp login"), render the chosen template with merge tokens, and send
// via the branded `send-email` function. All results are logged into
// platform_email_campaigns / platform_email_campaign_recipients.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOriginDetailed } from "../_shared/buildAuthLink.ts";
import { injectTracking } from "../_shared/emailTracking.ts";
import { buildEmailLogoUrl } from "../_shared/tenantEmailLogo.ts";
import { htmlToText, deriveSnippet } from "../_shared/htmlToText.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function renderTemplate(tpl: string, vars: Record<string, string>, isHtml: boolean) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k] ?? "";
    return isHtml ? escapeHtml(v) : v;
  });
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
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden: platform admin required" }, 403);

    const body = await req.json().catch(() => ({}));
    const tenant_id = String(body.tenant_id ?? "").trim();
    const template_slug = String(body.template_slug ?? "").trim();
    const branch_ids: string[] = Array.isArray(body.branch_ids) ? body.branch_ids : [];
    const dryRun = body.dry_run === true;

    if (!tenant_id) return json({ error: "tenant_id required" }, 400);
    if (!template_slug) return json({ error: "template_slug required" }, 400);
    if (!branch_ids.length) return json({ error: "branch_ids required" }, 400);

    const { data: template, error: tplErr } = await admin
      .from("platform_email_templates")
      .select("*")
      .eq("slug", template_slug)
      .maybeSingle();
    if (tplErr || !template) return json({ error: "Template not found" }, 404);

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, app_id, name, slug")
      .eq("id", tenant_id)
      .maybeSingle();
    if (!tenant) return json({ error: "Tenant not found" }, 404);

    const { data: brandSettings } = await admin
      .from("tenant_settings")
      .select("setting_key, setting_value")
      .eq("tenant_id", tenant_id)
      .eq("category", "branding");
    const brandMap: Record<string, any> = {};
    for (const r of (brandSettings ?? []) as any[]) brandMap[r.setting_key] = r.setting_value;
    const portalName = (typeof brandMap.portal_name === "string" && brandMap.portal_name) || tenant.name;

    const { data: branches } = await admin
      .from("branches")
      .select("id, name, email, slug, url_slug, trading_name")
      .eq("tenant_id", tenant_id)
      .in("id", branch_ids);

    // Preflight: activation emails send from the platform sender. If no
    // active platform mailbox is configured, refuse before we bother
    // provisioning users so the admin gets an immediate, actionable message.
    const { data: platformSender } = await admin
      .from("email_accounts")
      .select("id")
      .is("tenant_id", null)
      .is("branch_id", null)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const NO_PLATFORM_SENDER = "Platform sender mailbox not configured — connect one under Platform → Settings → Email.";

    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
    const resolved = await resolveAppOriginDetailed(admin, tenant_id, callerOrigin);
    if (!resolved) return json({ error: "Could not resolve app origin" }, 500);
    const appOrigin = resolved.origin;
    const tenantOwned = resolved.isTenantOwnedDomain;
    const slugPrefix = tenantOwned ? null : (tenant.slug ?? null);

    // Create campaign header (skip in dry-run)
    let campaignId: string | null = null;
    if (!dryRun) {
      const { data: campaign, error: campErr } = await admin
        .from("platform_email_campaigns")
        .insert({
          tenant_id,
          template_slug,
          subject_snapshot: template.subject,
          body_html_snapshot: template.body_html,
          body_text_snapshot: template.body_text,
          total_recipients: branches?.length ?? 0,
          created_by: caller.id,
          status: "running",
        })
        .select("id")
        .single();
      if (campErr) return json({ error: `Campaign create failed: ${campErr.message}` }, 500);
      campaignId = campaign.id;
    }

    const results: any[] = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const b of branches ?? []) {
      const email = (b.email ?? "").trim().toLowerCase();
      const contactName = b.trading_name || b.name;
      const branchSlug = b.url_slug || b.slug || "";
      const storeUrl = tenantOwned
        ? `${appOrigin}${branchSlug ? `/${branchSlug}` : ""}`
        : `${appOrigin}/t/${tenant.slug ?? ""}${branchSlug ? `/${branchSlug}` : ""}`;

      if (!email) {
        skipped++;
        results.push({ branch_id: b.id, branch: b.name, status: "skipped_no_email" });
        if (campaignId) await admin.from("platform_email_campaign_recipients").insert({
          campaign_id: campaignId, branch_id: b.id, email: null, status: "skipped_no_email",
        });
        continue;
      }

      try {
        // Ensure user + membership exist
        let profileId: string | null = null;
        const { data: existingProfile } = await admin
          .from("profiles").select("id").ilike("email", email).maybeSingle();
        if (existingProfile) {
          profileId = existingProfile.id;
        } else {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email, password: randomPassword(), email_confirm: true,
            user_metadata: { provisioned_for_branch: b.id, provisioned_by: caller.id },
          });
          if (createErr && !createErr.message?.toLowerCase().includes("already")) {
            throw new Error(`createUser: ${createErr.message}`);
          }
          if (created?.user) {
            profileId = created.user.id;
          } else {
            const { data: list } = await admin.auth.admin.listUsers();
            const ex = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
            if (!ex) throw new Error("Could not locate or create auth user");
            profileId = ex.id;
          }
          await admin.from("profiles").upsert(
            { id: profileId, email, display_name: b.name },
            { onConflict: "id" }
          );
        }

        // Branch-aware membership reconciliation. Mirrors _shared/sendBranchActivation.ts:
        //  (a) exact row for this branch → keep (reactivate if needed)
        //  (b) orphan row (branch_id NULL after previous branch delete) → adopt
        //  (c) row for a different branch → add a NEW row for this branch
        // Previously we only checked (profile_id, tenant_id) with maybeSingle(),
        // which silently skipped adding this branch when the user already
        // managed another branch in the tenant.
        const { data: allMems } = await admin
          .from("tenant_memberships")
          .select("id, branch_id, role, is_active")
          .eq("profile_id", profileId!)
          .eq("tenant_id", tenant_id)
          .eq("app_id", tenant.app_id);
        const memRows = (allMems ?? []) as Array<{ id: string; branch_id: string | null; role: string; is_active: boolean }>;
        const exactMem = memRows.find((r) => r.branch_id === b.id);
        if (exactMem) {
          if (!exactMem.is_active) {
            await admin.from("tenant_memberships").update({ is_active: true }).eq("id", exactMem.id);
          }
        } else {
          const orphanMem = memRows.find((r) => r.branch_id === null && (r.role === "branch_manager" || r.role === "store_operator"));
          if (orphanMem) {
            await admin.from("tenant_memberships").update({
              branch_id: b.id, is_active: true, role: "branch_manager",
            }).eq("id", orphanMem.id);
          } else {
            const { error: memInsErr } = await admin.from("tenant_memberships").insert({
              profile_id: profileId,
              tenant_id, app_id: tenant.app_id,
              role: "branch_manager", branch_id: b.id, is_active: true,
            });
            if (memInsErr) {
              const msg = memInsErr.message || "";
              // Translate opaque duplicate-key errors into something an admin can act on.
              if (memInsErr.code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
                throw new Error("This email already has a conflicting membership in this tenant — remove or update the existing membership before re-sending activation.");
              }
              throw new Error(`membership_insert: ${msg}`);
            }
          }
        }

        // Detect whether this email already manages other branches across the system.
        const { count: otherMembershipCount } = await admin
          .from("tenant_memberships")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", profileId!)
          .neq("branch_id", b.id);
        const isReturningUser = (otherMembershipCount ?? 0) > 0;

        // Mint our own opaque onboarding token (reusable for 1 hour, single
        // consumption on password set). The browser hits /welcome?token=... which
        // exchanges it for a fresh Supabase recovery URL on every click.
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const opaqueToken = btoa(String.fromCharCode(...tokenBytes))
          .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

        const actionLink = `${appOrigin}${slugPrefix ? `/t/${slugPrefix}` : ""}/welcome?token=${encodeURIComponent(opaqueToken)}`;

        const vars: Record<string, string> = {
          branch_name: b.name,
          contact_name: contactName,
          store_url: storeUrl,
          login_email: email,
          action_link: actionLink,
          tenant_name: tenant.name,
          portal_name: portalName,
          is_returning_user: isReturningUser ? "true" : "false",
          existing_branch_count: String(otherMembershipCount ?? 0),
        };

        const subject = renderTemplate(template.subject, vars, false);
        const htmlBody = renderTemplate(template.body_html, vars, true);
        const textBody = template.body_text ? renderTemplate(template.body_text, vars, false) : null;

        // Wrap body in tenant-branded shell using same style as invite emails
        const primary = (typeof brandMap.primary_color === "string" && brandMap.primary_color) || "#1a1a2e";
        const logoUrl = await buildEmailLogoUrl(admin, tenant_id, brandMap);
        const logoBlock = logoUrl
          ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portalName)}" style="max-height:48px;margin-bottom:24px;border:0;outline:none;text-decoration:none;display:block;" />`
          : `<div style="font-size:20px;font-weight:600;color:${primary};margin-bottom:24px;">${escapeHtml(portalName)}</div>`;

        // Preheader controls Outlook's inbox preview snippet. Without it the
        // client falls back to the first visible text — which used to be the
        // logo's <img src=...> URL.
        const bodyTextForSnippet = template.body_text
          ? renderTemplate(template.body_text, vars, false)
          : htmlToText(htmlBody);
        const preheader = deriveSnippet(bodyTextForSnippet)
          || `${portalName} — your store ${b.name} is ready. Set your password and sign in.`;
        const preheaderBlock = `<div style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#f5f5f7;">${escapeHtml(preheader)}</div>
<div style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#f5f5f7;">&#847; &zwnj; &nbsp; &#8199; &#8203; &#847; &zwnj; &nbsp; &#8199; &#8203; &#847; &zwnj; &nbsp; &#8199; &#8203;</div>`;

        const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
${preheaderBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td>
${logoBlock}
<div style="font-size:15px;line-height:1.6;color:#333;">${htmlBody}</div>
</td></tr></table>
</td></tr></table></body></html>`;

        const finalText = textBody ?? htmlToText(htmlBody);

        if (dryRun) {
          results.push({ branch_id: b.id, branch: b.name, email, status: "dry_run_ok", subject, action_link: actionLink, returning_user: isReturningUser });
          continue;
        }

        // Pre-insert recipient row so we have an id for open/click tracking
        const recipientStatus = isReturningUser ? "sent_existing_user" : "sent";
        const { data: recipientRow, error: rcptErr } = await admin
          .from("platform_email_campaign_recipients")
          .insert({
            campaign_id: campaignId, branch_id: b.id, email,
            status: "pending", action_link: actionLink,
          })
          .select("id")
          .single();
        if (rcptErr || !recipientRow) throw new Error(`recipient_insert: ${rcptErr?.message}`);

        const trackedHtml = await injectTracking(html, campaignId!, recipientRow.id, appOrigin);

        // Preflight: if no platform sender is configured we won't be able to
        // send this row — fail it cleanly with an actionable message instead
        // of letting send-email return a swallowed EMAIL_NOT_CONFIGURED.
        if (!platformSender) {
          await admin.from("platform_email_campaign_recipients").update({
            status: "failed", error: NO_PLATFORM_SENDER,
          }).eq("id", recipientRow.id);
          throw new Error(NO_PLATFORM_SENDER);
        }

        const sendResp = await fetch(`${url}/functions/v1/send-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
          body: JSON.stringify({
            to: email, subject, html: trackedHtml, text: finalText || undefined,
            // Platform-scope send: activation is Document Centre inviting a
            // new branch — must not use the (nonexistent) branch mailbox.
            tenant_id: null, branch_id: null, app_id: tenant.app_id ?? null,
            from_name: `${portalName} via Document Centre`,
            category: "system",
            related_type: "branch_activation",
            related_id: b.id,
            metadata: { tenant_id, branch_id: b.id, campaign_id: campaignId, recipient_id: recipientRow.id, kind: "branch_activation" },
          }),
        });
        const sendText = await sendResp.text();
        let sendBody: any = null;
        try { sendBody = JSON.parse(sendText); } catch { /* not JSON */ }
        if (!sendResp.ok) {
          await admin.from("platform_email_campaign_recipients").update({
            status: "failed", error: `send-email ${sendResp.status}: ${sendText}`,
          }).eq("id", recipientRow.id);
          throw new Error(`send-email ${sendResp.status}: ${sendText}`);
        }
        if (sendBody?.error === "EMAIL_NOT_CONFIGURED") {
          await admin.from("platform_email_campaign_recipients").update({
            status: "failed", error: NO_PLATFORM_SENDER,
          }).eq("id", recipientRow.id);
          throw new Error(NO_PLATFORM_SENDER);
        }

        sent++;
        await admin.from("platform_email_campaign_recipients").update({
          status: recipientStatus, sent_at: new Date().toISOString(),
        }).eq("id", recipientRow.id);

        // Persist the opaque onboarding token so /welcome can exchange it later.
        await admin.from("platform_onboarding_tokens").insert({
          token: opaqueToken,
          campaign_recipient_id: recipientRow.id,
          tenant_id,
          branch_id: b.id,
          profile_id: profileId,
          email,
          purpose: "branch_welcome",
        });
        results.push({ branch_id: b.id, branch: b.name, email, status: recipientStatus });
      } catch (e) {
        failed++;
        const msg = (e as Error).message ?? "unknown";
        if (!dryRun && campaignId) {
          await admin.from("platform_email_campaign_recipients").insert({
            campaign_id: campaignId, branch_id: b.id, email, status: "failed", error: msg,
          });
        }
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
    console.error("send-branch-welcome-campaign error:", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
