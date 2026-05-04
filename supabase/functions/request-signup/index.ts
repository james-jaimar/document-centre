// Customer self-service signup on a tenant portal.
// Creates the user via admin API, attaches tenant membership, and enqueues a
// branded "set your password" email via the tenant's SMTP account.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOrigin, buildAppVerifyLink } from "../_shared/buildAuthLink.ts";
import { enqueueEmail } from "../_shared/email-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function randomPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const display_name = body?.display_name ? String(body.display_name).trim() : null;
    const first_name = body?.first_name ? String(body.first_name).trim() : null;
    const last_name = body?.last_name ? String(body.last_name).trim() : null;
    const phone = body?.phone ? String(body.phone).trim() : null;
    const tenant_slug = body?.tenant_slug ? String(body.tenant_slug) : null;
    const userPassword = body?.password ? String(body.password) : null;

    if (!email || !email.includes("@") || !tenant_slug) {
      return new Response(JSON.stringify({ error: "email and tenant_slug required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name, app_id, slug")
      .eq("slug", tenant_slug)
      .maybeSingle();
    if (!tenant) {
      return new Response(JSON.stringify({ error: "Unknown tenant" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Existing profile?
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    let profileId: string;
    let isNewAccount = false;

    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: userPassword || randomPassword(),
        email_confirm: true,
        user_metadata: {
          display_name: display_name || null,
          first_name: first_name || null,
          last_name: last_name || null,
          tenant_slug,
        },
      });
      if (createErr || !created?.user) {
        if (createErr?.message?.toLowerCase().includes("already")) {
          const { data: list } = await admin.auth.admin.listUsers();
          const e = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
          if (!e) {
            return new Response(JSON.stringify({ error: createErr.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          profileId = e.id;
        } else {
          return new Response(JSON.stringify({ error: createErr?.message ?? "create failed" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        profileId = created.user.id;
        isNewAccount = true;
      }

      await admin.from("profiles").upsert(
        {
          id: profileId,
          email,
          display_name: display_name || null,
          first_name: first_name || null,
          last_name: last_name || null,
          phone: phone || null,
        },
        { onConflict: "id" }
      );
    }

    // Ensure tenant membership
    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("profile_id", profileId)
      .eq("tenant_id", tenant.id)
      .eq("app_id", tenant.app_id)
      .maybeSingle();

    if (!membership) {
      await admin.from("tenant_memberships").insert({
        profile_id: profileId,
        tenant_id: tenant.id,
        app_id: tenant.app_id,
        role: "customer",
      });
      await admin.from("profiles").update({ tenant_id: tenant.id }).eq("id", profileId);
    }

    // Generate set-password link via app origin
    const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
    const appOrigin = await resolveAppOrigin(admin, tenant.id, callerOrigin);
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

    // Tenant branding
    const { data: settings } = await admin
      .from("tenant_settings")
      .select("setting_key, setting_value")
      .eq("tenant_id", tenant.id)
      .eq("category", "branding");
    const map: Record<string, any> = {};
    for (const r of settings ?? []) map[r.setting_key] = r.setting_value;
    const portalName = (typeof map.portal_name === "string" && map.portal_name) || tenant.name;
    const primary = typeof map.primary_color === "string" ? map.primary_color : "#1a1a2e";
    const logoUrl = typeof map.logo_url === "string" ? map.logo_url : null;
    const logo = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portalName)}" style="max-height:48px;margin-bottom:24px;" />`
      : `<div style="font-size:20px;font-weight:600;color:${primary};margin-bottom:24px;">${escapeHtml(portalName)}</div>`;

    const subject = isNewAccount
      ? `Welcome to ${portalName} — confirm your account`
      : `You've been added to ${portalName}`;
    const heading = isNewAccount ? `Welcome to ${escapeHtml(portalName)}` : `Account access confirmed`;
    const intro = isNewAccount
      ? `Thanks for signing up. Click below to set your password and sign in.`
      : `Your account has access to <strong>${escapeHtml(portalName)}</strong>. Click below to confirm.`;

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td>
${logo}<h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 16px;">${heading}</h1>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px;">${intro}</p>
<a href="${escapeHtml(actionLink ?? appOrigin)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:15px;">Set your password</a>
<p style="font-size:13px;color:#888;margin:32px 0 0;line-height:1.5;">If the button doesn't work, copy this link:<br/><a href="${escapeHtml(actionLink ?? appOrigin)}" style="color:${primary};word-break:break-all;">${escapeHtml(actionLink ?? appOrigin)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
    const text = `${heading}\n\n${intro.replace(/<[^>]+>/g, "")}\n\nSet your password: ${actionLink}`;

    await enqueueEmail(admin, {
      tenant_id: tenant.id,
      app_id: tenant.app_id,
      to: email,
      subject,
      html,
      text,
      category: "auth",
      metadata: { kind: isNewAccount ? "signup" : "membership_added", profile_id: profileId },
    });

    return new Response(JSON.stringify({ success: true, profile_id: profileId, invited: isNewAccount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("request-signup error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
