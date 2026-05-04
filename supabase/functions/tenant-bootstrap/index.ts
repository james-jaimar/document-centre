// Joins an anonymous user to a tenant as a customer membership.
// Generalized version of demo-bootstrap — works for any tenant slug.
// Idempotent — safe to call multiple times.
//
// Body: { tenant_slug: string }
// Returns: { slug, tenant_id, app_id }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantSlug = body.tenant_slug;
    if (!tenantSlug || typeof tenantSlug !== "string") {
      return json({ error: "tenant_slug is required" }, 400);
    }

    const admin = createClient(url, serviceKey);

    // Find the tenant
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("id, app_id, slug")
      .eq("slug", tenantSlug)
      .eq("is_active", true)
      .maybeSingle();

    if (tErr || !tenant) {
      console.error("tenant-bootstrap: tenant not found", tenantSlug, tErr);
      return json({ error: "Tenant not found" }, 404);
    }

    // Tag the profile with the tenant
    await admin
      .from("profiles")
      .update({ tenant_id: tenant.id, is_demo: (tenantSlug === "demo") })
      .eq("id", user.id);

    // Idempotent membership
    const { data: existing } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("tenant_id", tenant.id)
      .eq("app_id", tenant.app_id)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await admin
        .from("tenant_memberships")
        .insert({
          profile_id: user.id,
          tenant_id: tenant.id,
          app_id: tenant.app_id,
          role: "customer",
          is_active: true,
        });

      if (insErr && insErr.code !== "23505") {
        console.error("tenant-bootstrap: membership insert failed", insErr);
        return json({ error: insErr.message }, 500);
      }
    }

    return json({
      slug: tenant.slug,
      tenant_id: tenant.id,
      app_id: tenant.app_id,
    });
  } catch (e) {
    console.error("tenant-bootstrap error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
