// Handles post-OAuth setup. Called by /auth/callback after Supabase establishes
// the session. Tenant-firewalled: storefront OAuth auto-creates a `customer`
// membership; platform OAuth requires an existing membership (no auto-grant).
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

interface Body {
  tenant_slug?: string | null;
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
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const body = (await req.json().catch(() => ({}))) as Body;
    const tenantSlug = body.tenant_slug?.trim() || null;

    // Ensure profile exists (handle_new_user trigger should create it, but OAuth
    // edge cases — e.g. provider returning no display_name — mean we belt-and-brace).
    const displayName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      null;

    await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email ?? null,
          display_name: displayName,
          avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
        },
        { onConflict: "id", ignoreDuplicates: false },
      );

    // Storefront OAuth — auto-create customer membership scoped to this tenant only.
    if (tenantSlug) {
      const { data: tenant, error: tenantErr } = await admin
        .from("tenants")
        .select("id, app_id, slug, is_active, name")
        .eq("slug", tenantSlug)
        .maybeSingle();

      if (tenantErr) return json({ error: tenantErr.message }, 500);
      if (!tenant) return json({ error: "Tenant not found" }, 404);
      if (!tenant.is_active) return json({ error: "Tenant inactive" }, 403);
      if (!tenant.app_id) return json({ error: "Tenant misconfigured" }, 500);

      // Upsert customer membership (idempotent — never escalates an existing role).
      const { data: existing } = await admin
        .from("tenant_memberships")
        .select("id, role, is_active")
        .eq("profile_id", user.id)
        .eq("tenant_id", tenant.id)
        .eq("app_id", tenant.app_id)
        .maybeSingle();

      let action: "created" | "reactivated" | "existing" = "existing";

      if (!existing) {
        const { error: insErr } = await admin.from("tenant_memberships").insert({
          profile_id: user.id,
          tenant_id: tenant.id,
          app_id: tenant.app_id,
          role: "customer",
          is_active: true,
        });
        if (insErr) return json({ error: insErr.message }, 500);
        action = "created";
      } else if (!existing.is_active) {
        const { error: updErr } = await admin
          .from("tenant_memberships")
          .update({ is_active: true })
          .eq("id", existing.id);
        if (updErr) return json({ error: updErr.message }, 500);
        action = "reactivated";
      }

      // Audit log (best-effort).
      await admin.from("user_admin_audit").insert({
        actor_profile_id: user.id,
        target_profile_id: user.id,
        tenant_id: tenant.id,
        app_id: tenant.app_id,
        action: `oauth_membership_${action}`,
        metadata: { provider: "google", tenant_slug: tenantSlug },
      });

      return json({
        ok: true,
        action,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      });
    }

    // Platform OAuth — sign-in only, no auto-membership.
    const { data: memberships, error: memErr } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .limit(1);

    if (memErr) return json({ error: memErr.message }, 500);
    if (!memberships || memberships.length === 0) {
      return json(
        {
          error:
            "No account found for this Google login. Staff accounts are invite-only — please ask your administrator to invite you.",
        },
        403,
      );
    }

    await admin.from("user_admin_audit").insert({
      actor_profile_id: user.id,
      target_profile_id: user.id,
      action: "oauth_platform_signin",
      metadata: { provider: "google" },
    });

    return json({ ok: true, action: "signin" });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
