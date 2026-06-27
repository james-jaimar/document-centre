// Shared core: mints an opaque /welcome onboarding token + sends a branded
// activation email to the recipient. Used by:
//   - send-branch-welcome-campaign (platform-admin-initiated direct send)
//   - request-activation-email      (recipient self-service via /activate/:slug)
//
// Returns the opaque token + action_link so the caller can persist it into
// platform_onboarding_tokens (the actual insert happens in the caller so it
// can attach campaign / request metadata).

import { resolveAppOriginDetailed } from "./buildAuthLink.ts";
import { injectTracking } from "./emailTracking.ts";
import { buildEmailLogoUrl } from "./tenantEmailLogo.ts";
import { htmlToText, deriveSnippet } from "./htmlToText.ts";

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

export function renderTemplate(tpl: string, vars: Record<string, string>, isHtml: boolean) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k] ?? "";
    return isHtml ? escapeHtml(v) : v;
  });
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function mintOpaqueToken(): string {
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  return btoa(String.fromCharCode(...tokenBytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface SendActivationInput {
  admin: any;                         // service-role supabase client
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;                 // forwarded to send-email
  tenantId: string;
  branchId: string;
  templateSlug: string;               // platform_email_templates.slug (kind=activation)
  callerOrigin: string | null;
  provisionedBy?: string | null;      // user id for audit (optional)
  tracking?: { campaignId: string; recipientId: string } | null;
}

export interface SendActivationResult {
  ok: boolean;
  error?: string;
  opaqueToken?: string;
  actionLink?: string;
  email?: string;
  profileId?: string;
  isReturningUser?: boolean;
  subject?: string;
}

export async function sendBranchActivationEmail(input: SendActivationInput): Promise<SendActivationResult> {
  const { admin, supabaseUrl, anonKey, authHeader, tenantId, branchId, templateSlug, callerOrigin } = input;

  const { data: template } = await admin
    .from("platform_email_templates").select("*").eq("slug", templateSlug).maybeSingle();
  if (!template) return { ok: false, error: "template_not_found" };

  const { data: tenant } = await admin
    .from("tenants").select("id, app_id, name, slug").eq("id", tenantId).maybeSingle();
  if (!tenant) return { ok: false, error: "tenant_not_found" };

  const { data: branch } = await admin
    .from("branches")
    .select("id, name, email, slug, url_slug, trading_name")
    .eq("id", branchId).maybeSingle();
  if (!branch) return { ok: false, error: "branch_not_found" };

  const email = (branch.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "no_branch_email" };

  const { data: brandSettings } = await admin
    .from("tenant_settings")
    .select("setting_key, setting_value")
    .eq("tenant_id", tenantId).eq("category", "branding");
  const brandMap: Record<string, any> = {};
  for (const r of (brandSettings ?? []) as any[]) brandMap[r.setting_key] = r.setting_value;
  const portalName = (typeof brandMap.portal_name === "string" && brandMap.portal_name) || tenant.name;

  const resolved = await resolveAppOriginDetailed(admin, tenantId, callerOrigin);
  if (!resolved) return { ok: false, error: "origin_unresolved" };
  const appOrigin = resolved.origin;
  const tenantOwned = resolved.isTenantOwnedDomain;
  const slugPrefix = tenantOwned ? null : (tenant.slug ?? null);

  const branchSlug = branch.url_slug || branch.slug || "";
  const storeUrl = tenantOwned
    ? `${appOrigin}${branchSlug ? `/${branchSlug}` : ""}`
    : `${appOrigin}/t/${tenant.slug ?? ""}${branchSlug ? `/${branchSlug}` : ""}`;

  // Ensure profile + membership
  let profileId: string | null = null;
  const { data: existingProfile } = await admin
    .from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existingProfile) {
    profileId = existingProfile.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: randomPassword(), email_confirm: true,
      user_metadata: { provisioned_for_branch: branchId, provisioned_by: input.provisionedBy ?? null },
    });
    if (createErr && !createErr.message?.toLowerCase().includes("already")) {
      return { ok: false, error: `createUser: ${createErr.message}` };
    }
    if (created?.user) {
      profileId = created.user.id;
    } else {
      const { data: list } = await admin.auth.admin.listUsers();
      const ex = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
      if (!ex) return { ok: false, error: "could_not_locate_or_create_user" };
      profileId = ex.id;
    }
    await admin.from("profiles").upsert(
      { id: profileId, email, display_name: branch.name },
      { onConflict: "id" }
    );
  }

  const { data: existingMembership } = await admin
    .from("tenant_memberships")
    .select("id").eq("profile_id", profileId!).eq("tenant_id", tenantId)
    .eq("app_id", tenant.app_id).maybeSingle();
  if (!existingMembership) {
    await admin.from("tenant_memberships").insert({
      profile_id: profileId, tenant_id: tenantId, app_id: tenant.app_id,
      role: "branch_manager", branch_id: branchId, is_active: true,
    });
  }

  const { count: otherMembershipCount } = await admin
    .from("tenant_memberships")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId!).neq("branch_id", branchId);
  const isReturningUser = (otherMembershipCount ?? 0) > 0;

  const opaqueToken = mintOpaqueToken();
  const actionLink = `${appOrigin}${slugPrefix ? `/t/${slugPrefix}` : ""}/welcome?token=${encodeURIComponent(opaqueToken)}`;

  const contactName = branch.trading_name || branch.name;
  const vars: Record<string, string> = {
    branch_name: branch.name,
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

  const primary = (typeof brandMap.primary_color === "string" && brandMap.primary_color) || "#1a1a2e";
  const logoUrl = await buildEmailLogoUrl(admin, tenantId, brandMap);
  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portalName)}" style="max-height:48px;margin-bottom:24px;border:0;outline:none;text-decoration:none;display:block;" />`
    : `<div style="font-size:20px;font-weight:600;color:${primary};margin-bottom:24px;">${escapeHtml(portalName)}</div>`;

  // Preheader = the inbox "preview snippet". Without this Outlook scrapes the
  // raw HTML (and surfaces the logo URL). The zero-width spacer pushes any
  // remaining visible content out of the snippet.
  const bodyTextForSnippet = template.body_text
    ? renderTemplate(template.body_text, vars, false)
    : htmlToText(htmlBody);
  const preheader = deriveSnippet(bodyTextForSnippet)
    || `${portalName} — your store ${branch.name} is ready. Set your password and sign in.`;
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

  const finalHtml = input.tracking
    ? await injectTracking(html, input.tracking.campaignId, input.tracking.recipientId)
    : html;

  const finalText = textBody ?? htmlToText(htmlBody);

  const sendResp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
    body: JSON.stringify({ to: email, subject, html: finalHtml, text: finalText || undefined }),
  });
  if (!sendResp.ok) {
    const t = await sendResp.text();
    return { ok: false, error: `send-email ${sendResp.status}: ${t}` };
  }

  return { ok: true, opaqueToken, actionLink, email, profileId: profileId!, isReturningUser, subject };
}
