// One-shot helper: provision a `branch_manager` account for every branch in a tenant,
// keyed off branches.email. No invite emails sent — admin uses the existing
// "Resend invite" flow in /admin/users when each branch is ready.
//
// Caller must be a platform_admin.
//
// POST body: { tenant_id: string, dry_run?: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    // Platform admin gate
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden: platform admin required" }, 403);

    const body = await req.json().catch(() => ({}));
    const tenant_id = String(body.tenant_id ?? "").trim();
    const dryRun = body.dry_run === true;
    if (!tenant_id) return json({ error: "tenant_id required" }, 400);

    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, app_id, name, slug")
      .eq("id", tenant_id)
      .maybeSingle();
    if (tenantErr || !tenant) return json({ error: "Tenant not found" }, 404);

    const { data: branches, error: branchesErr } = await admin
      .from("branches")
      .select("id, name, email")
      .eq("tenant_id", tenant_id)
      .order("name");
    if (branchesErr) return json({ error: branchesErr.message }, 500);

    // Page through auth users once so we can look up by email
    const emailToUserId = new Map<string, string>();
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) return json({ error: `listUsers: ${error.message}` }, 500);
      for (const u of data.users) {
        if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id);
      }
      if (!data.users.length || data.users.length < perPage) break;
      page++;
      if (page > 50) break;
    }

    const results: Array<Record<string, unknown>> = [];

    for (const b of branches ?? []) {
      const email = (b.email ?? "").trim().toLowerCase();
      if (!email) {
        results.push({ branch: b.name, status: "skipped_no_email" });
        continue;
      }

      if (dryRun) {
        results.push({
          branch: b.name,
          email,
          status: emailToUserId.has(email) ? "would_reuse_user" : "would_create_user",
        });
        continue;
      }

      let profileId = emailToUserId.get(email);
      let createdUser = false;

      if (!profileId) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: randomPassword(),
          email_confirm: true,
          user_metadata: { provisioned_for_branch: b.id, provisioned_by: caller.id },
        });
        if (createErr || !created?.user) {
          results.push({ branch: b.name, email, status: "error", error: createErr?.message });
          continue;
        }
        profileId = created.user.id;
        emailToUserId.set(email, profileId);
        createdUser = true;
      }

      // Upsert profile (fill blanks only)
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id, display_name")
        .eq("id", profileId)
        .maybeSingle();

      if (!existingProfile) {
        await admin.from("profiles").insert({
          id: profileId,
          email,
          display_name: b.name,
        });
      } else if (!existingProfile.display_name) {
        await admin.from("profiles").update({ display_name: b.name }).eq("id", profileId);
      }

      // Check for existing membership in this tenant
      const { data: existingMembership } = await admin
        .from("tenant_memberships")
        .select("id, role, branch_id")
        .eq("profile_id", profileId)
        .eq("tenant_id", tenant_id)
        .eq("app_id", tenant.app_id)
        .maybeSingle();

      if (existingMembership) {
        results.push({
          branch: b.name,
          email,
          status: "membership_exists",
          existing_role: existingMembership.role,
          existing_branch_id: existingMembership.branch_id,
        });
        continue;
      }

      const { error: memErr } = await admin.from("tenant_memberships").insert({
        profile_id: profileId,
        tenant_id,
        app_id: tenant.app_id,
        role: "branch_manager",
        branch_id: b.id,
        is_active: true,
      });

      if (memErr) {
        results.push({ branch: b.name, email, status: "membership_error", error: memErr.message });
        continue;
      }

      results.push({
        branch: b.name,
        email,
        profile_id: profileId,
        status: createdUser ? "created" : "reused_existing_user",
      });
    }

    const counts: Record<string, number> = {};
    for (const r of results) {
      const s = String(r.status);
      counts[s] = (counts[s] ?? 0) + 1;
    }

    return json({ tenant: tenant.name, total: results.length, counts, results });
  } catch (e) {
    console.error("provision-branch-admins error:", e);
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
