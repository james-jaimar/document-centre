// Staff creates a new customer in their tenant/branch and emails them a
// "set your password" link. The customer can be impersonated immediately
// (orders built on their behalf will be waiting after first login).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
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

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const tenant_id = String(body.tenant_id ?? "").trim();
    const branch_id = body.branch_id ? String(body.branch_id) : null;
    const first_name = body.first_name ? String(body.first_name).trim() : null;
    const last_name = body.last_name ? String(body.last_name).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const send_invite = body.send_invite !== false; // default true

    if (!email || !tenant_id) return json({ error: "email and tenant_id required" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Invalid email" }, 400);

    const admin = createClient(url, serviceKey);

    // Authorise: caller must be platform admin, or tenant owner/admin, or branch staff in that branch
    const { data: callerMems } = await admin
      .from("tenant_memberships")
      .select("role, tenant_id, branch_id, is_active")
      .eq("profile_id", caller.id)
      .eq("is_active", true);
    const isPlatform = (await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle()).data != null;

    const tenantAdmin = (callerMems ?? []).some(
      (m: any) => m.tenant_id === tenant_id && ["owner", "admin"].includes(m.role),
    );
    const branchStaff = branch_id && (callerMems ?? []).some(
      (m: any) =>
        m.tenant_id === tenant_id &&
        m.branch_id === branch_id &&
        ["owner", "admin", "branch_manager", "store_operator", "sales", "production", "accounts"].includes(m.role),
    );
    if (!isPlatform && !tenantAdmin && !branchStaff) {
      return json({ error: "Forbidden" }, 403);
    }

    // Tenant lookup (for app_id and redirect origin)
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("id, app_id, slug, custom_domain, name")
      .eq("id", tenant_id)
      .maybeSingle();
    if (tErr || !tenant) return json({ error: "Tenant not found" }, 404);

    // Find or create the auth user.
    let profileId: string | null = null;
    let created = false;
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      const { data: cu, error: cuErr } = await admin.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: {
          provisioned_by: caller.id,
          provisioned_for_tenant: tenant_id,
          provisioned_for_branch: branch_id,
        },
      });
      if (cuErr && !cuErr.message?.toLowerCase().includes("already")) {
        return json({ error: `createUser: ${cuErr.message}` }, 500);
      }
      if (cu?.user) {
        profileId = cu.user.id;
        created = true;
      } else {
        const { data: list } = await admin.auth.admin.listUsers();
        const ex = list?.users?.find((u: any) => u.email?.toLowerCase() === email);
        if (!ex) return json({ error: "Could not create user" }, 500);
        profileId = ex.id;
      }
    }

    // Upsert profile fields
    await admin.from("profiles").upsert(
      {
        id: profileId,
        email,
        first_name,
        last_name,
        phone,
        display_name: [first_name, last_name].filter(Boolean).join(" ") || email,
      },
      { onConflict: "id" },
    );

    // Customer membership tagging — so the customer shows up in the branch
    // list immediately, before any orders exist.
    const { data: existingMem } = await admin
      .from("tenant_memberships")
      .select("id, branch_id, role")
      .eq("profile_id", profileId!)
      .eq("tenant_id", tenant_id)
      .eq("app_id", tenant.app_id)
      .eq("role", "customer")
      .maybeSingle();
    if (!existingMem) {
      await admin.from("tenant_memberships").insert({
        profile_id: profileId,
        tenant_id,
        app_id: tenant.app_id,
        role: "customer",
        branch_id,
        is_active: true,
      });
    } else if (branch_id && existingMem.branch_id !== branch_id) {
      // Membership exists at tenant level but not yet for this branch — add another row.
      await admin.from("tenant_memberships").insert({
        profile_id: profileId,
        tenant_id,
        app_id: tenant.app_id,
        role: "customer",
        branch_id,
        is_active: true,
      });
    }

    // Generate a recovery link so the customer can set their own password.
    let recovery_link: string | null = null;
    if (send_invite) {
      const origin =
        tenant.custom_domain
          ? `https://${tenant.custom_domain}`
          : (req.headers.get("origin") || "https://document-centre.com");
      const redirectTo = `${origin}/reset-password`;
      const { data: link, error: linkErr } = await (admin.auth as any).admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (linkErr) {
        return json({ ok: true, profile_id: profileId, created, warning: `Link generation failed: ${linkErr.message}` });
      }
      recovery_link = link?.properties?.action_link ?? null;
      // Supabase auth-email-hook will dispatch the branded "recovery" template
      // automatically once generateLink is called with type=recovery and email
      // delivery is enabled. We still surface the link so the UI can copy it
      // if needed (e.g. if SMTP is misconfigured).
    }

    return json({
      ok: true,
      profile_id: profileId,
      created,
      recovery_link,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
