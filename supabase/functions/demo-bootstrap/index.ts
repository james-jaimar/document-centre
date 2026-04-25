// Joins a freshly-created anonymous user to the dedicated Demo tenant
// as a customer membership. Idempotent — safe to call multiple times.
//
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

    const admin = createClient(url, serviceKey);

    // Find the demo tenant
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("id, app_id, slug")
      .eq("slug", "demo")
      .eq("is_active", true)
      .maybeSingle();

    if (tErr || !tenant) {
      console.error("demo-bootstrap: demo tenant not found", tErr);
      return json({ error: "Demo tenant not configured" }, 500);
    }

    // Tag the profile as a demo user (defensive — the trigger should already do it)
    await admin
      .from("profiles")
      .update({ is_demo: true, tenant_id: tenant.id })
      .eq("id", user.id);

    // Idempotent membership: read-then-insert (no specific unique index required)
    const { data: existing, error: selErr } = await admin
      .from("tenant_memberships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("tenant_id", tenant.id)
      .eq("app_id", tenant.app_id)
      .maybeSingle();

    if (selErr) {
      console.error("demo-bootstrap: membership lookup failed", selErr);
      return json({ error: selErr.message }, 500);
    }

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

      // Tolerate races: if a parallel call (e.g. the handle_new_user trigger)
      // already inserted the membership, treat as success.
      if (insErr && insErr.code !== "23505") {
        console.error("demo-bootstrap: membership insert failed", insErr);
        return json({ error: insErr.message }, 500);
      }
    }

    return json({
      slug: tenant.slug,
      tenant_id: tenant.id,
      app_id: tenant.app_id,
    });
  } catch (e) {
    console.error("demo-bootstrap error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
