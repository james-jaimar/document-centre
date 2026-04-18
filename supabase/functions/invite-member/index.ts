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

interface BrandInfo {
  tenantName: string;
  primaryColor: string;
  logoUrl: string | null;
  portalName: string;
}

async function getTenantBranding(admin: ReturnType<typeof createClient>, tenantId: string): Promise<BrandInfo> {
  const [{ data: tenant }, { data: settings }] = await Promise.all([
    admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    admin
      .from("tenant_settings")
      .select("setting_key, setting_value")
      .eq("tenant_id", tenantId)
      .eq("category", "branding"),
  ]);

  const map: Record<string, any> = {};
  for (const row of settings ?? []) map[row.setting_key] = row.setting_value;

  return {
    tenantName: (tenant as any)?.name ?? "Your account",
    primaryColor: typeof map.primary_color === "string" ? map.primary_color : "#1a1a2e",
    logoUrl: typeof map.logo_url === "string" && map.logo_url ? map.logo_url : null,
    portalName: typeof map.portal_name === "string" && map.portal_name ? map.portal_name : ((tenant as any)?.name ?? "Your portal"),
  };
}

function buildInviteEmail(brand: BrandInfo, actionLink: string, isNewAccount: boolean) {
  const subject = isNewAccount
    ? `You've been invited to ${brand.portalName}`
    : `You've been added to ${brand.portalName}`;

  const heading = isNewAccount
    ? `Welcome to ${escapeHtml(brand.portalName)}`
    : `You're now part of ${escapeHtml(brand.portalName)}`;

  const intro = isNewAccount
    ? `You've been invited to access <strong>${escapeHtml(brand.portalName)}</strong>. Click the button below to set your password and sign in.`
    : `Your account now has access to <strong>${escapeHtml(brand.portalName)}</strong>. Use the link below to confirm access.`;

  const cta = isNewAccount ? "Set your password" : "Open portal";

  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.portalName)}" style="max-height:48px;margin-bottom:24px;" />`
    : `<div style="font-size:20px;font-weight:600;color:${brand.primaryColor};margin-bottom:24px;">${escapeHtml(brand.portalName)}</div>`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td>
          ${logo}
          <h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 16px;">${heading}</h1>
          <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px;">${intro}</p>
          <a href="${escapeHtml(actionLink)}" style="display:inline-block;background:${brand.primaryColor};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:15px;">${cta}</a>
          <p style="font-size:13px;color:#888;margin:32px 0 0;line-height:1.5;">If the button doesn't work, copy and paste this link into your browser:<br/><a href="${escapeHtml(actionLink)}" style="color:${brand.primaryColor};word-break:break-all;">${escapeHtml(actionLink)}</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
          <p style="font-size:12px;color:#999;margin:0;">If you weren't expecting this, you can safely ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = `${heading}\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${cta}: ${actionLink}\n\nIf you weren't expecting this, you can safely ignore this email.`;

  return { subject, html, text };
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
    if (!authHeader?.startsWith("Bearer ")) {
      return err("Unauthorized", 401);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) return err("Unauthorized", 401);

    const admin = createClient(url, serviceKey);

    const body = await req.json();
    const { email, tenant_id, app_id, role, branch_id, can_view_all_orders } = body;

    if (!email || !tenant_id || !app_id || !role) {
      return err("Missing required fields: email, tenant_id, app_id, role");
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Verify caller is admin/owner for this tenant
    const { data: callerMembership } = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("profile_id", caller.id)
      .eq("tenant_id", tenant_id)
      .eq("app_id", app_id)
      .eq("is_active", true)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();

    const { data: platformRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .limit(1)
      .maybeSingle();

    if (!callerMembership && !platformRole) {
      return err("Forbidden: you must be an admin or owner of this tenant", 403);
    }

    // Look up existing profile
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, email, display_name, first_name, last_name")
      .ilike("email", cleanEmail)
      .limit(1)
      .maybeSingle();

    let profileId: string;
    let isNewAccount = false;

    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      // Create user silently — no Supabase email
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { invited_by: caller.id },
      });

      if (createErr || !created?.user) {
        // User may already exist in auth but not in profiles
        if (createErr?.message?.toLowerCase().includes("already")) {
          const { data: list } = await admin.auth.admin.listUsers();
          const existing = list?.users?.find(
            (u: any) => u.email?.toLowerCase() === cleanEmail
          );
          if (!existing) return err(`Failed to create user: ${createErr.message}`);
          profileId = existing.id;
        } else {
          return err(`Failed to create user: ${createErr?.message || "unknown"}`);
        }
      } else {
        profileId = created.user.id;
        isNewAccount = true;
      }

      // Ensure profile row exists
      await admin.from("profiles").upsert(
        {
          id: profileId,
          email: cleanEmail,
          display_name: cleanEmail.split("@")[0],
        },
        { onConflict: "id" }
      );
    }

    // Check membership exists
    const { data: existingMembership } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("profile_id", profileId)
      .eq("tenant_id", tenant_id)
      .eq("app_id", app_id)
      .limit(1)
      .maybeSingle();

    if (existingMembership) {
      return err("This user already has a membership in this tenant", 409);
    }

    // Create membership
    const { error: memberErr } = await admin
      .from("tenant_memberships")
      .insert({
        profile_id: profileId,
        tenant_id,
        app_id,
        role,
        branch_id: branch_id || null,
        can_view_all_orders: can_view_all_orders ?? false,
      });

    if (memberErr) {
      return err(`Failed to create membership: ${memberErr.message}`);
    }

    // Generate password-setup link (no email sent by Supabase)
    let actionLink: string | null = null;
    try {
      const origin = req.headers.get("origin") || req.headers.get("referer") || "";
      const siteUrl = origin ? new URL(origin).origin : "";
      const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;

      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: cleanEmail,
        options: redirectTo ? { redirectTo } : undefined,
      });

      if (!linkErr && linkData?.properties?.action_link) {
        actionLink = linkData.properties.action_link;
      } else if (linkErr) {
        console.error("generateLink error:", linkErr);
      }
    } catch (e) {
      console.error("generateLink threw:", e);
    }

    // Send branded email via SMTP send-email function
    let emailSent = false;
    if (actionLink) {
      try {
        const brand = await getTenantBranding(admin, tenant_id);
        const { subject, html, text } = buildInviteEmail(brand, actionLink, isNewAccount);

        const sendResp = await fetch(`${url}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
            apikey: anonKey,
          },
          body: JSON.stringify({ to: cleanEmail, subject, html, text }),
        });

        if (sendResp.ok) {
          emailSent = true;
        } else {
          const body = await sendResp.text();
          console.error("send-email failed:", sendResp.status, body);
        }
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
          ? (emailSent ? "Invitation sent" : "User created — invite email failed to send")
          : "Existing user added to tenant",
      },
      201
    );
  } catch (e) {
    console.error("invite-member error:", e);
    return err("Internal server error", 500);
  }
});
