// Admin operations on user accounts. Requires caller to be tenant owner/admin
// (for tenant-scoped actions) or platform_admin (for cross-tenant actions).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

type Action =
  | "force_password_reset"
  | "disable_account"
  | "enable_account"
  | "delete_account"
  | "resend_invite"
  | "update_email"
  | "remove_membership"
  | "revoke_platform_admin";

interface Body {
  action: Action;
  target_profile_id: string;
  tenant_id?: string | null;
  app_id?: string | null;
  membership_id?: string | null;
  new_email?: string;
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) return err("Unauthorized", 401);

    const admin = createClient(url, serviceKey);

    const body = (await req.json()) as Body;
    const { action, target_profile_id, tenant_id, app_id, membership_id, new_email, reason } = body;

    if (!action || !target_profile_id) {
      return err("Missing action or target_profile_id");
    }

    // Authorisation: platform admin OR tenant owner/admin for the given tenant
    const { data: platformRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();
    const isPlatformAdmin = !!platformRow;

    let isTenantAdmin = false;
    if (tenant_id && app_id) {
      const { data: m } = await admin
        .from("tenant_memberships")
        .select("role")
        .eq("profile_id", caller.id)
        .eq("tenant_id", tenant_id)
        .eq("app_id", app_id)
        .eq("is_active", true)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      isTenantAdmin = !!m;
    }

    if (!isPlatformAdmin && !isTenantAdmin) {
      return err("Forbidden", 403);
    }

    // Fetch target profile (for email + audit)
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", target_profile_id)
      .maybeSingle();

    const targetEmail = targetProfile?.email ?? null;

    // Helper to record audit
    const audit = async (extra: Record<string, unknown> = {}) => {
      await admin.from("user_admin_audit").insert({
        actor_profile_id: caller.id,
        target_profile_id,
        target_email: targetEmail,
        tenant_id: tenant_id ?? null,
        app_id: app_id ?? null,
        action,
        reason: reason ?? null,
        metadata: extra,
      });
    };

    switch (action) {
      case "force_password_reset":
      case "resend_invite": {
        if (!targetEmail) return err("Target user has no email on file");
        const origin = req.headers.get("origin") || req.headers.get("referer") || "";
        const siteUrl = origin ? new URL(origin).origin : "";
        const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;

        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: targetEmail,
          options: redirectTo ? { redirectTo } : undefined,
        });
        if (linkErr) return err(`Failed to generate link: ${linkErr.message}`);

        const actionLink = (linkData as any)?.properties?.action_link as string | undefined;

        // For resend_invite, fetch tenant branding and send a branded email via send-email.
        let emailSent = false;
        if (action === "resend_invite" && actionLink && tenant_id) {
          try {
            const { data: tenantRow } = await admin
              .from("tenants")
              .select("name")
              .eq("id", tenant_id)
              .maybeSingle();
            const { data: settingsRows } = await admin
              .from("tenant_settings")
              .select("setting_key, setting_value")
              .eq("tenant_id", tenant_id)
              .eq("category", "branding");

            const settings: Record<string, any> = {};
            for (const r of settingsRows ?? []) settings[r.setting_key] = r.setting_value;

            const portalName = (typeof settings.portal_name === "string" && settings.portal_name)
              || (tenantRow as any)?.name || "Your portal";
            const primary = typeof settings.primary_color === "string" ? settings.primary_color : "#1a1a2e";
            const logoUrl = typeof settings.logo_url === "string" ? settings.logo_url : null;

            const escapeHtml = (s: string) =>
              s.replace(/[&<>"']/g, (c) =>
                ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
              );

            const subject = `Your sign-in link for ${portalName}`;
            const heading = `Sign in to ${escapeHtml(portalName)}`;
            const intro = `Use the button below to sign in and set a new password if needed.`;
            const logo = logoUrl
              ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portalName)}" style="max-height:48px;margin-bottom:24px;" />`
              : `<div style="font-size:20px;font-weight:600;color:${primary};margin-bottom:24px;">${escapeHtml(portalName)}</div>`;

            const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td>
${logo}<h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 16px;">${heading}</h1>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px;">${intro}</p>
<a href="${escapeHtml(actionLink)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:15px;">Open portal</a>
<p style="font-size:13px;color:#888;margin:32px 0 0;line-height:1.5;">If the button doesn't work, copy and paste this link:<br/><a href="${escapeHtml(actionLink)}" style="color:${primary};word-break:break-all;">${escapeHtml(actionLink)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
            const text = `${heading}\n\n${intro}\n\nOpen portal: ${actionLink}`;

            const sendResp = await fetch(`${url}/functions/v1/send-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
                apikey: anonKey,
              },
              body: JSON.stringify({ to: targetEmail, subject, html, text }),
            });
            emailSent = sendResp.ok;
            if (!sendResp.ok) {
              const body = await sendResp.text();
              console.error("send-email failed:", sendResp.status, body);
            }
          } catch (e) {
            console.error("resend_invite send-email threw:", e);
          }
        }

        await audit({ delivered_via: action === "resend_invite" ? "send_email" : "auth_email_hook", email_sent: emailSent });
        return json({
          success: true,
          message: action === "resend_invite"
            ? (emailSent ? "Invite email resent" : "Sign-in link generated (email send failed)")
            : "Password reset email sent",
        });
      }

      case "disable_account": {
        const { error: e } = await admin.auth.admin.updateUserById(target_profile_id, {
          ban_duration: "876000h", // ~100 years
        });
        if (e) return err(`Failed to disable: ${e.message}`);
        await admin.from("profiles").update({ is_active: false }).eq("id", target_profile_id);
        await audit();
        return json({ success: true, message: "Account disabled" });
      }

      case "enable_account": {
        const { error: e } = await admin.auth.admin.updateUserById(target_profile_id, {
          ban_duration: "none",
        });
        if (e) return err(`Failed to enable: ${e.message}`);
        await admin.from("profiles").update({ is_active: true }).eq("id", target_profile_id);
        await audit();
        return json({ success: true, message: "Account enabled" });
      }

      case "delete_account": {
        if (!isPlatformAdmin) return err("Only platform admins can delete accounts", 403);
        await audit({ deleted_at: new Date().toISOString() });
        const { error: e } = await admin.auth.admin.deleteUser(target_profile_id);
        if (e) return err(`Failed to delete: ${e.message}`);
        return json({ success: true, message: "Account deleted" });
      }

      case "update_email": {
        if (!new_email) return err("Missing new_email");
        const cleanEmail = String(new_email).trim().toLowerCase();
        const { error: e } = await admin.auth.admin.updateUserById(target_profile_id, {
          email: cleanEmail,
          email_confirm: true,
        });
        if (e) return err(`Failed to update email: ${e.message}`);
        await admin.from("profiles").update({ email: cleanEmail }).eq("id", target_profile_id);
        await audit({ new_email: cleanEmail, old_email: targetEmail });
        return json({ success: true, message: "Email updated" });
      }

      case "remove_membership": {
        if (!membership_id) return err("Missing membership_id");
        const { error: e } = await admin
          .from("tenant_memberships")
          .delete()
          .eq("id", membership_id);
        if (e) return err(`Failed to remove membership: ${e.message}`);
        await audit({ membership_id });
        return json({ success: true, message: "Membership removed" });
      }

      case "revoke_platform_admin": {
        if (!isPlatformAdmin) return err("Only platform admins can revoke platform admin", 403);
        if (target_profile_id === caller.id) return err("You cannot revoke your own platform admin role", 400);

        // Prevent lockout — at least one platform admin must remain
        const { data: remaining } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "platform_admin");
        const others = (remaining ?? []).filter((r) => r.user_id !== target_profile_id);
        if (others.length === 0) return err("Cannot revoke the only platform admin", 400);

        const { error: e } = await admin
          .from("user_roles")
          .delete()
          .eq("user_id", target_profile_id)
          .eq("role", "platform_admin");
        if (e) return err(`Failed to revoke: ${e.message}`);
        await audit();
        return json({ success: true, message: "Platform admin access revoked" });
      }

      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (e) {
    console.error("manage-user error:", e);
    return err("Internal server error", 500);
  }
});
