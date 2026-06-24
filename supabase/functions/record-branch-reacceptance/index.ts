import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { branch_id: string; acceptances: { slug: string; version: number }[] };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.branch_id || !Array.isArray(body.acceptances) || body.acceptances.length === 0) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: branch } = await admin
    .from("branches").select("id, tenant_id").eq("id", body.branch_id).maybeSingle();
  if (!branch) {
    return new Response(JSON.stringify({ error: "Branch not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: platformRole } = await admin
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle();
  const { data: membership } = await admin
    .from("tenant_memberships").select("role, branch_id, is_active")
    .eq("profile_id", user.id).eq("tenant_id", branch.tenant_id).eq("is_active", true);
  const ok = !!platformRole || (membership ?? []).some((m: any) =>
    ["owner", "admin"].includes(m.role) || (m.role === "branch_manager" && m.branch_id === branch.id)
  );
  if (!ok) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;
  const rows = body.acceptances.map((a) => ({
    branch_id: branch.id,
    tenant_id: branch.tenant_id,
    accepted_by: user.id,
    document_slug: a.slug,
    document_version: a.version,
    ip_address: ip,
    user_agent: ua,
    context: "branch_reacceptance",
  }));
  const { error } = await admin.from("subscription_acceptances" as any).insert(rows);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, count: rows.length }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
