import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let body: { branch_id?: string; reason?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body.branch_id || typeof body.branch_id !== "string") {
    return json({ error: "branch_id required" }, 400);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: branch } = await sb
    .from("branches")
    .select("id, tenant_id")
    .eq("id", body.branch_id)
    .single();
  if (!branch) return json({ error: "Branch not found" }, 404);

  const { data: platformRole } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .maybeSingle();
  const { data: membership } = await sb
    .from("tenant_memberships")
    .select("role")
    .eq("profile_id", user.id)
    .eq("tenant_id", branch.tenant_id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!platformRole && !membership) return json({ error: "Forbidden" }, 403);

  const { data, error } = await sb
    .from("branch_subscriptions" as any)
    .upsert({
      branch_id: branch.id,
      tenant_id: branch.tenant_id,
      status: "active",
      billing_status: "free",
      trial_status: "converted",
      cancelled_at: null,
      assigned_at: new Date().toISOString(),
      assigned_by: user.id,
    }, { onConflict: "branch_id" })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, subscription: data });
});