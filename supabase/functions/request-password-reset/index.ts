// Customer self-service password reset.
// - Generates a recovery link via auth.admin.generateLink (no Supabase email).
// - Enqueues a branded email via email_outbox using the tenant's SMTP account.
// - Always returns { success: true } (no user enumeration).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOrigin, buildAppVerifyLink } from "../_shared/buildAuthLink.ts";
import { enqueueEmail } from "../_shared/email-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const tenant_slug = body?.tenant_slug ? String(body.tenant_slug) : null;

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant from slug
    let tenant: any = null;
    if (tenant_slug) {
      const { data } = await admin
        .from("tenants")
        .select("id, name, app_id, slug")
        .eq("slug", tenant_slug)
        .maybeSingle();
      tenant = data;
    }

    // Find user
    const { data: profile } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (!profile) {
      // No enumeration — pretend we sent it
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
    const appOrigin = await resolveAppOrigin(admin, tenant?.id ?? null, callerOrigin);
    if (!appOrigin) {
      return new Response(JSON.stringify({ error: "Could not resolve app origin" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${appOrigin}/reset-password` },
    });
    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = buildAppVerifyLink(appOrigin, linkData, "/reset-password");
    if (!actionLink) {
      return new Response(JSON.stringify({ error: "Failed to build link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build branded email
    let portalName = tenant?.name ?? "Document Centre";
    let primary = "#1a1a2e";
    let logoUrl: string | null = null;
    if (tenant?.id) {
      const { data: settings } = await admin
        .from("tenant_settings")
        .select("setting_key, setting_value")
        .eq("tenant_id", tenant.id)
        .eq("category", "branding");
      const map: Record<string, any> = {};
      for (const r of settings ?? []) map[r.setting_key] = r.setting_value;
      if (typeof map.portal_name === "string" && map.portal_name) portalName = map.portal_name;
      if (typeof map.primary_color === "string") primary = map.primary_color;
      if (typeof map.logo_url === "string" && map.logo_url) logoUrl = map.logo_url;
    }

    const subject = `Reset your password for ${portalName}`;
    const heading = `Reset your password`;
    const intro = `Click the button below to set a new password for your <strong>${escapeHtml(portalName)}</strong> account. This link expires in 1 hour.`;
    const logo = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portalName)}" style="max-height:48px;margin-bottom:24px;" />`
      : `<div style="font-size:20px;font-weight:600;color:${primary};margin-bottom:24px;">${escapeHtml(portalName)}</div>`;

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td>
${logo}<h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 16px;">${heading}</h1>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px;">${intro}</p>
<a href="${escapeHtml(actionLink)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:15px;">Reset password</a>
<p style="font-size:13px;color:#888;margin:32px 0 0;line-height:1.5;">If the button doesn't work, copy this link:<br/><a href="${escapeHtml(actionLink)}" style="color:${primary};word-break:break-all;">${escapeHtml(actionLink)}</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
<p style="font-size:12px;color:#999;margin:0;">If you didn't request this, you can safely ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;

    const text = `${heading}\n\n${intro.replace(/<[^>]+>/g, "")}\n\nReset password: ${actionLink}`;

    await enqueueEmail(admin, {
      tenant_id: tenant?.id ?? null,
      app_id: tenant?.app_id ?? null,
      to: email,
      subject,
      html,
      text,
      category: "auth",
      metadata: { kind: "password_reset", profile_id: profile.id },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("request-password-reset error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
