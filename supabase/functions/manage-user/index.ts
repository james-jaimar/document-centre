// Admin operations on user accounts. Requires caller to be tenant owner/admin
// (for tenant-scoped actions) or platform_admin (for cross-tenant actions).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveAppOrigin, buildAppVerifyLink } from "../_shared/buildAuthLink.ts";
import { enqueueEmail } from "../_shared/email-queue.ts";
import { pickEmailLogoUrl } from "../_shared/emailLogo.ts";

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
  | "send_welcome"
  | "set_password"
  | "disable_account"
  | "enable_account"
  | "delete_account"
  | "resend_invite"
  | "update_email"
  | "update_profile"
  | "remove_membership"
  | "update_membership_role"
  | "revoke_platform_admin";

interface Body {
  action: Action;
  target_profile_id: string;
  tenant_id?: string | null;
  app_id?: string | null;
  branch_id?: string | null;
  membership_id?: string | null;
  new_email?: string;
  new_password?: string;
  new_role?: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
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
    const { action, target_profile_id, tenant_id, app_id, branch_id, membership_id, new_email, new_password, new_role, display_name, first_name, last_name, phone, reason } = body;

    if (!action || !target_profile_id) {
      return err("Missing action or target_profile_id");
    }

    // Self-protection guardrails for destructive actions
    if (target_profile_id === caller.id) {
      if (action === "disable_account" || action === "delete_account") {
        return err("You cannot perform this action on your own account", 400);
      }
    }

    // Authorisation: platform admin OR tenant owner/admin OR branch staff (limited actions)
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

    // Branch-staff authorisation: limited to safe actions on customers who
    // have actually transacted at one of the caller's branches.
    const BRANCH_ALLOWED_ACTIONS: Action[] = [
      "force_password_reset",
      "send_welcome",
      "update_profile",
      "update_email",
      "resend_invite",
    ];
    // Branch-manager-only elevated actions on staff at their own branch.
    const BRANCH_MANAGER_STAFF_ACTIONS: Action[] = [
      "set_password",
      "disable_account",
      "enable_account",
      "remove_membership",
      "update_membership_role",
    ];
    let isAuthorisedBranchStaff = false;
    if (
      !isPlatformAdmin &&
      !isTenantAdmin &&
      branch_id &&
      tenant_id
    ) {
      const { data: bm } = await admin
        .from("tenant_memberships")
        .select("role")
        .eq("profile_id", caller.id)
        .eq("tenant_id", tenant_id)
        .eq("branch_id", branch_id)
        .eq("is_active", true)
        .in("role", ["owner", "admin", "sales", "accounts", "production", "branch_manager", "store_operator"])
        .maybeSingle();
      if (bm) {
        if (BRANCH_ALLOWED_ACTIONS.includes(action)) {
          const { data: belongs } = await admin.rpc("profile_belongs_to_branch", {
            _profile_id: target_profile_id,
            _branch_id: branch_id,
          });
          if (belongs === true) isAuthorisedBranchStaff = true;
        } else if (
          bm.role === "branch_manager" &&
          BRANCH_MANAGER_STAFF_ACTIONS.includes(action) &&
          app_id &&
          target_profile_id !== caller.id
        ) {
          // Verify target is a staff member at THIS branch (branch_manager or store_operator).
          const { data: targetMembership } = await admin
            .from("tenant_memberships")
            .select("role")
            .eq("profile_id", target_profile_id)
            .eq("tenant_id", tenant_id)
            .eq("app_id", app_id)
            .eq("branch_id", branch_id)
            .in("role", ["branch_manager", "store_operator"])
            .maybeSingle();
          if (targetMembership) isAuthorisedBranchStaff = true;
        }
      }
    }


    if (!isPlatformAdmin && !isTenantAdmin && !isAuthorisedBranchStaff) {
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
        const callerOrigin = req.headers.get("origin") || req.headers.get("referer") || null;
        const appOrigin = await resolveAppOrigin(admin, tenant_id ?? null, callerOrigin);
        if (!appOrigin) return err("Could not resolve app URL for verification link", 500);

        const { data: tenantSlugRow } = tenant_id
          ? await admin.from("tenants").select("slug").eq("id", tenant_id).maybeSingle()
          : { data: null as any };
        const tenantSlug = (tenantSlugRow as any)?.slug ?? null;

        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: targetEmail,
          options: { redirectTo: `${appOrigin}${tenantSlug ? `/t/${tenantSlug}` : ""}/reset-password` },
        });
        if (linkErr) return err(`Failed to generate link: ${linkErr.message}`);

        const actionLink = buildAppVerifyLink(appOrigin, linkData, "/reset-password", tenantSlug);
        if (!actionLink) return err("Failed to build verification link", 500);

        // Resolve tenant branding for the email body
        let portalName = "Your portal";
        let primary = "#1a1a2e";
        let logoUrl: string | null = null;
        if (tenant_id) {
          const { data: tenantRow } = await admin
            .from("tenants")
            .select("name")
            .eq("id", tenant_id)
            .maybeSingle();
          if ((tenantRow as any)?.name) portalName = (tenantRow as any).name;

          const { data: settingsRows } = await admin
            .from("tenant_settings")
            .select("setting_key, setting_value")
            .eq("tenant_id", tenant_id)
            .eq("category", "branding");
          const settings: Record<string, any> = {};
          for (const r of settingsRows ?? []) settings[r.setting_key] = r.setting_value;
          if (typeof settings.portal_name === "string" && settings.portal_name) portalName = settings.portal_name;
          if (typeof settings.primary_color === "string") primary = settings.primary_color;
          logoUrl = pickEmailLogoUrl(settings);
        }

        const escapeHtml = (s: string) =>
          s.replace(/[&<>"']/g, (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
          );

        const isInvite = action === "resend_invite";
        const subject = isInvite
          ? `Your sign-in link for ${portalName}`
          : `Reset your password for ${portalName}`;
        const heading = isInvite ? `Sign in to ${escapeHtml(portalName)}` : `Reset your password`;
        const intro = isInvite
          ? `Use the button below to sign in and set a new password if needed. This link expires in 1 hour.`
          : `Click the button below to set a new password for your <strong>${escapeHtml(portalName)}</strong> account. This link expires in 1 hour.`;
        const buttonLabel = isInvite ? "Open portal" : "Reset password";
        const logo = logoUrl
          ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(portalName)}" style="max-height:48px;margin-bottom:24px;" />`
          : `<div style="font-size:20px;font-weight:600;color:${primary};margin-bottom:24px;">${escapeHtml(portalName)}</div>`;

        const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><tr><td>
${logo}<h1 style="font-size:22px;font-weight:600;color:#111;margin:0 0 16px;">${heading}</h1>
<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px;">${intro}</p>
<a href="${escapeHtml(actionLink)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:15px;">${buttonLabel}</a>
<p style="font-size:13px;color:#888;margin:32px 0 0;line-height:1.5;">If the button doesn't work, copy and paste this link:<br/><a href="${escapeHtml(actionLink)}" style="color:${primary};word-break:break-all;">${escapeHtml(actionLink)}</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
<p style="font-size:12px;color:#999;margin:0;">If you didn't expect this email, you can safely ignore it.</p>
</td></tr></table></td></tr></table></body></html>`;
        const text = `${heading}\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${buttonLabel}: ${actionLink}`;

        try {
          await enqueueEmail(admin, {
            tenant_id: tenant_id ?? null,
            app_id: app_id ?? null,
            to: targetEmail,
            subject,
            html,
            text,
            category: "auth",
            created_by_profile_id: caller.id,
            metadata: {
              kind: isInvite ? "resend_invite" : "force_password_reset",
              profile_id: target_profile_id,
            },
          });
        } catch (e) {
          console.error("enqueueEmail failed:", e);
          return err(`Failed to enqueue email: ${(e as Error).message}`, 500);
        }

        await audit({ delivered_via: "email_outbox", delivery: "queued" });
        return json({
          success: true,
          message: isInvite
            ? `Invite link sent to ${targetEmail}`
            : `Reset link sent to ${targetEmail}`,
        });
      }

      case "set_password": {
        if (!new_password || new_password.length < 6) {
          return err("Password must be at least 6 characters");
        }
        const { error: pwErr } = await admin.auth.admin.updateUserById(target_profile_id, {
          password: new_password,
        });
        if (pwErr) return err(`Failed to set password: ${pwErr.message}`);
        await audit({ note: "Password manually set by admin" });
        return json({ success: true, message: "Password updated successfully" });
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
        // Tenant owners/admins may delete their own customers; platform admins
        // may delete anyone.
        if (!isPlatformAdmin) {
          if (!isTenantAdmin || !tenant_id) {
            return err("You are not allowed to delete this account", 403);
          }
          const { data: targetMems } = await admin
            .from("tenant_memberships")
            .select("tenant_id, role")
            .eq("profile_id", target_profile_id);
          const outside = (targetMems ?? []).some((m: any) => m.tenant_id !== tenant_id);
          const staff = (targetMems ?? []).some((m: any) => m.role !== "customer");
          if (outside || staff) {
            return err(
              "This person has access beyond your customers — remove them from this tenant instead",
              403,
            );
          }
        }

        // Several tables reference the user with ON DELETE NO ACTION (orders,
        // messages, timeline, etc.), so the auth delete fails while those rows
        // exist. Detach the references first — the records themselves stay.
        const detach: Array<[string, string]> = [
          ["orders", "ordered_by_profile_id"],
          ["orders", "created_by_admin_profile_id"],
          ["orders", "impersonated_by"],
          ["order_jobs", "assigned_to_profile_id"],
          ["order_documents", "created_by"],
          ["order_adjustments", "created_by"],
          ["timeline_events", "actor_profile_id"],
          ["timeline_events", "impersonated_by"],
          ["messages", "sender_profile_id"],
          ["messages", "impersonated_by"],
          ["status_history", "changed_by"],
          ["tenant_subscriptions", "assigned_by"],
          ["contact_submissions", "handled_by_profile_id"],
          ["email_outbox", "created_by_profile_id"],
        ];
        for (const [table, column] of detach) {
          const { error: dErr } = await admin
            .from(table)
            .update({ [column]: null })
            .eq(column, target_profile_id);
          if (dErr) console.error(`detach ${table}.${column}: ${dErr.message}`);
        }

        await audit({ deleted_at: new Date().toISOString() });
        const { error: e } = await admin.auth.admin.deleteUser(target_profile_id);
        if (e) return err(`Failed to delete: ${e.message}`);
        return json({ success: true, message: "Account deleted" });
      }


      case "update_profile": {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (display_name !== undefined) updates.display_name = display_name;
        if (first_name !== undefined) updates.first_name = first_name;
        if (last_name !== undefined) updates.last_name = last_name;
        if (phone !== undefined) updates.phone = phone;
        if (Object.keys(updates).length === 1) return err("No profile fields provided");
        const { error: e } = await admin.from("profiles").update(updates).eq("id", target_profile_id);
        if (e) return err(`Failed to update profile: ${e.message}`);
        await audit({ updates });
        return json({ success: true, message: "Profile updated" });
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

        // Last-manager guard: don't strip the final branch_manager from a branch.
        const { data: targetRow } = await admin
          .from("tenant_memberships")
          .select("id, role, branch_id, tenant_id, app_id")
          .eq("id", membership_id)
          .maybeSingle();
        if (targetRow?.role === "branch_manager" && targetRow.branch_id) {
          const { data: peers } = await admin
            .from("tenant_memberships")
            .select("id")
            .eq("tenant_id", targetRow.tenant_id)
            .eq("app_id", targetRow.app_id)
            .eq("branch_id", targetRow.branch_id)
            .eq("role", "branch_manager")
            .eq("is_active", true)
            .neq("id", membership_id);
          if (!peers || peers.length === 0) {
            return err("Cannot remove the only branch manager. Promote another staff member first.", 400);
          }
        }

        const { error: e } = await admin
          .from("tenant_memberships")
          .delete()
          .eq("id", membership_id);
        if (e) return err(`Failed to remove membership: ${e.message}`);
        await audit({ membership_id });
        return json({ success: true, message: "Membership removed" });
      }

      case "update_membership_role": {
        if (!membership_id) return err("Missing membership_id");
        if (!new_role) return err("Missing new_role");
        const ALLOWED_BRANCH_ROLES = ["branch_manager", "store_operator"];
        if (!ALLOWED_BRANCH_ROLES.includes(new_role)) {
          return err("new_role must be branch_manager or store_operator");
        }

        const { data: targetRow } = await admin
          .from("tenant_memberships")
          .select("id, role, branch_id, tenant_id, app_id, profile_id")
          .eq("id", membership_id)
          .maybeSingle();
        if (!targetRow) return err("Membership not found", 404);
        if (!ALLOWED_BRANCH_ROLES.includes(targetRow.role)) {
          return err("Only branch staff roles can be promoted or demoted here");
        }
        if (targetRow.role === new_role) {
          return json({ success: true, message: "Role unchanged" });
        }

        // Don't let a manager demote themselves out of their only management seat.
        if (
          targetRow.profile_id === caller.id &&
          targetRow.role === "branch_manager" &&
          new_role === "store_operator"
        ) {
          return err("You cannot demote yourself. Ask another manager to do it.", 400);
        }

        // Last-manager guard on demotion.
        if (
          targetRow.role === "branch_manager" &&
          new_role === "store_operator" &&
          targetRow.branch_id
        ) {
          const { data: peers } = await admin
            .from("tenant_memberships")
            .select("id")
            .eq("tenant_id", targetRow.tenant_id)
            .eq("app_id", targetRow.app_id)
            .eq("branch_id", targetRow.branch_id)
            .eq("role", "branch_manager")
            .eq("is_active", true)
            .neq("id", membership_id);
          if (!peers || peers.length === 0) {
            return err("Cannot demote the only branch manager. Promote another staff member first.", 400);
          }
        }

        const { error: e } = await admin
          .from("tenant_memberships")
          .update({ role: new_role })
          .eq("id", membership_id);
        if (e) return err(`Failed to update role: ${e.message}`);
        await audit({ membership_id, from_role: targetRow.role, to_role: new_role });
        return json({ success: true, message: `Role updated to ${new_role === "branch_manager" ? "Branch Manager" : "Store Operator"}` });
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
