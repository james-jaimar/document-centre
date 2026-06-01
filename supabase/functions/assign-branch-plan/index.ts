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
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    branch_id: string;
    region_id?: string | null;
    assigned_plan_slug: string;
    discount_type?: string | null;
    discount_value?: number | null;
    trial_days?: number | null;
    promo_code_id?: string | null;
  };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.branch_id || !body.assigned_plan_slug) {
    return new Response(JSON.stringify({ error: "branch_id and assigned_plan_slug required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: branch } = await sb.from("branches").select("id, tenant_id").eq("id", body.branch_id).single();
  if (!branch) {
    return new Response(JSON.stringify({ error: "Branch not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: platformRole } = await sb
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle();
  const { data: membership } = await sb
    .from("tenant_memberships").select("role")
    .eq("profile_id", user.id).eq("tenant_id", branch.tenant_id).eq("is_active", true)
    .in("role", ["owner", "admin"]).maybeSingle();
  if (!platformRole && !membership) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve effective price to decide billing_status/status
  let basePrice = 0;
  {
    let q = sb.from("platform_pricing_plans").select("price,region_id").eq("plan_slug", body.assigned_plan_slug);
    if (body.region_id) q = q.eq("region_id", body.region_id);
    const { data: planRows } = await q;
    if (planRows && planRows.length) {
      const match = planRows.find((p: any) => p.region_id === body.region_id) ?? planRows[0];
      basePrice = Number(match.price ?? 0);
    }
  }
  let effectivePrice = basePrice;
  if (body.discount_value && body.discount_value > 0) {
    if (body.discount_type === "percentage") {
      effectivePrice = basePrice * (1 - body.discount_value / 100);
    } else if (body.discount_type === "fixed_amount") {
      effectivePrice = Math.max(0, basePrice - body.discount_value);
    }
  }
  const isFree = effectivePrice <= 0;

  const upsert = {
    branch_id: branch.id,
    tenant_id: branch.tenant_id,
    region_id: body.region_id ?? null,
    assigned_plan_slug: body.assigned_plan_slug,
    assigned_at: new Date().toISOString(),
    assigned_by: user.id,
    discount_type: body.discount_type ?? null,
    discount_value: body.discount_value ?? null,
    trial_days: body.trial_days ?? null,
    promo_code_id: body.promo_code_id ?? null,
    billing_status: isFree ? "free" : "pending_payment",
    status: isFree ? "active" : "incomplete",
  };

  const { data, error } = await sb
    .from("branch_subscriptions" as any)
    .upsert(upsert, { onConflict: "branch_id" })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ subscription: data }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
