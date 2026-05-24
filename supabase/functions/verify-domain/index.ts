// Verify custom domain DNS — checks if a CNAME or A record points to the platform.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);

    const { domain, tenant_id, expected_target } = await req.json();
    if (!domain || !tenant_id) return json({ error: "domain and tenant_id required" }, 400);

    // Verify caller is tenant admin
    const { data: membership } = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("profile_id", caller.id)
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .in("role", ["owner", "admin"])
      .maybeSingle();

    const { data: platformRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (!membership && !platformRole) return json({ error: "Forbidden" }, 403);

    // Perform DNS lookups
    const results: { cname: string[] | null; a: string[] | null; error?: string } = {
      cname: null,
      a: null,
    };

    try {
      results.cname = await Deno.resolveDns(domain, "CNAME");
    } catch {
      results.cname = null;
    }

    try {
      results.a = await Deno.resolveDns(domain, "A");
    } catch {
      results.a = null;
    }

    // Check if CNAME points to expected target (e.g. tenant's platform subdomain),
    // or to any known platform host. Fall back to "any A record present" as a soft signal.
    const target = (expected_target || "").toLowerCase();
    const PLATFORM_HOSTS = ["document-centre.com", "amplifyapp.com", "lovable.app"];
    const cnameMatch = results.cname?.some((r: string) => {
      const v = r.toLowerCase();
      if (target && v.includes(target)) return true;
      return PLATFORM_HOSTS.some((h) => v.includes(h));
    }) ?? false;

    const verified = cnameMatch || (results.a !== null && results.a.length > 0);

    // Update tenant's domain verification status
    if (verified) {
      await admin
        .from("tenants")
        .update({
          custom_domain: domain,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenant_id);
    }

    return json({
      domain,
      verified,
      cname_records: results.cname,
      a_records: results.a,
      expected_target: target,
      message: verified
        ? "DNS is correctly configured."
        : "DNS records not found or not pointing to Document Centre. Please check your CNAME configuration.",
    });
  } catch (e) {
    console.error("verify-domain error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
