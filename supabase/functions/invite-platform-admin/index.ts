// Invite a new Platform Admin. Caller must already be platform_admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOrigin, buildAppVerifyLink } from "../_shared/buildAuthLink.ts";

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
const err = (m: string, s = 400) => json({ error: m }, s);

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

function buildEmail(actionLink: string, isNewAccount: boolean) {
  const subject = isNewAccount
    ? "You've been invited to Document Centre"
    : "You now have Platform Admin access on Document Centre";
  const heading = isNewAccount
    ? "Welcome to Document Centre"
    : "Platform access granted";
  const intro = isNewAccount
    ? "You've been granted <strong>Platform Admin</strong> access. Click below to set your password and sign in."
    : "Your account now has <strong>Platform Admin</strong> access. Use the link below to confirm access.";
  const cta = isNewAccount ? "Set your password" : "Open Document Centre";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
<tr><td>
<div style="font-size:20px;font-weight:600;color:#1a1a2e;margin-bottom:24px;">Document Centre</div>
<h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 16px;">${heading}</h1>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px;">${intro}</p>
<a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:15px;">${cta}</a>
<p style="font-size:13px;color:#888;margin:32px 0 0;line-height:1.5;">If the button doesn't work, copy this link:<br/><a href="${escapeHtml(actionLink)}" style="color:#1a1a2e;word-break:break-all;">${escapeHtml(actionLink)}</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
<p style="font-size:12px;color:#999;margin:0;">If you weren't expecting this, you can safely ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = `${heading}\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${cta}: ${actionLink}`;
  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    // Caller must be a platform admin
    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();
    if (!callerRole) return err("Forbidden — platform admins only", 403);

    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const displayName = body?.display_name ? String(body.display_name).trim() : null;

    if (!email || !email.includes("@")) return err("Valid email required");

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
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { invited_by: caller.id, display_name: displayName },
      });

      if (createErr || !created?.user) {
        if (createErr?.message?.toLowerCase().includes("already")) {
          const { data: list } = await admin.auth.admin.listUsers();
          const existing = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
          if (!existing) return err(`Failed to create user: ${createErr.message}`);
          profileId = existing.id;
        } else {
          return err(`Failed to create user: ${createErr?.message || "unknown"}`);
        }
      } else {
        profileId = created.user.id;
        isNewAccount = true;
      }

      await admin.from("profiles").upsert(
        {
          id: profileId,
          email,
          display_name: displayName || email.split("@")[0],
        },
        { onConflict: "id" }
      );
    }

    // Grant platform_admin role (idempotent)
    const { data: existingRole } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", profileId)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (!existingRole) {
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert({ user_id: profileId, role: "platform_admin" });
      if (roleErr) return err(`Failed to assign platform_admin: ${roleErr.message}`);
    }

    // Audit
    await admin.from("user_admin_audit").insert({
      actor_profile_id: caller.id,
      target_profile_id: profileId,
      target_email: email,
      tenant_id: null,
      app_id: null,
      action: "grant_platform_admin",
      reason: null,
      metadata: { invited_new_account: isNewAccount },
    }).then(() => {}, () => {}); // ignore if table doesn't exist

    // Generate password setup link via app-hosted URL (never expose Supabase domain)
    let actionLink: string | null = null;
    try {
      const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
      const appOrigin = await resolveAppOrigin(admin, null, callerOrigin);
      if (!appOrigin) {
        console.error("Could not resolve app origin for platform admin invite");
      } else {
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${appOrigin}/reset-password` },
        });
        if (linkErr) {
          console.error("generateLink error:", linkErr);
        } else {
          actionLink = buildAppVerifyLink(appOrigin, linkData, "/reset-password");
        }
      }
    } catch (e) {
      console.error("generateLink threw:", e);
    }

    let emailSent = false;
    if (actionLink) {
      try {
        const { subject, html, text } = buildEmail(actionLink, isNewAccount);
        const sendResp = await fetch(`${url}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            apikey: anonKey,
          },
          body: JSON.stringify({ to: email, subject, html, text }),
        });
        emailSent = sendResp.ok;
        if (!sendResp.ok) console.error("send-email failed:", await sendResp.text());
      } catch (e) {
        console.error("send-email threw:", e);
      }
    }

    return json(
      {
        success: true,
        profile_id: profileId,
        invited: isNewAccount,
        email_sent: emailSent,
        message: isNewAccount
          ? (emailSent ? "Invitation sent" : "User created — invite email failed")
          : "Existing user granted Platform Admin access",
      },
      201
    );
  } catch (e) {
    console.error("invite-platform-admin error:", e);
    return err("Internal server error", 500);
  }
});
