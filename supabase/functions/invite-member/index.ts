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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
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

    // Also allow platform_admin
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

    // Check if user already exists
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, email, display_name, first_name, last_name")
      .ilike("email", email.trim())
      .limit(1)
      .maybeSingle();

    let profileId: string;

    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      // Invite user via Admin API
      const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email.trim(),
        {
          data: {
            invited_by: caller.id,
            tenant_slug: undefined, // don't auto-create membership via trigger
          },
        }
      );

      if (inviteErr) {
        // User may already exist in auth but not in profiles
        if (inviteErr.message?.includes("already been registered")) {
          const { data: { users } } = await admin.auth.admin.listUsers();
          const existing = users?.find(
            (u: any) => u.email?.toLowerCase() === email.trim().toLowerCase()
          );
          if (existing) {
            profileId = existing.id;
            // Ensure profile exists
            await admin.from("profiles").upsert({
              id: existing.id,
              email: email.trim(),
              display_name: email.trim().split("@")[0],
            }, { onConflict: "id" });
          } else {
            return err(`Failed to invite user: ${inviteErr.message}`);
          }
        } else {
          return err(`Failed to invite user: ${inviteErr.message}`);
        }
      } else {
        profileId = inviteData.user.id;
        // Create profile
        await admin.from("profiles").upsert({
          id: profileId,
          email: email.trim(),
          display_name: email.trim().split("@")[0],
        }, { onConflict: "id" });
      }
    }

    // Check if membership already exists
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

    return json({
      success: true,
      profile_id: profileId,
      invited: !existingProfile,
      message: existingProfile
        ? "Existing user added to tenant"
        : "Invitation sent and membership created",
    }, 201);

  } catch (e) {
    console.error("invite-member error:", e);
    return err("Internal server error", 500);
  }
});
