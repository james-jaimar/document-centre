import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

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

  let body: { branch_id: string; return_url: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.branch_id || !body.return_url) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Authorise: platform admin OR active tenant_membership in (owner/admin/branch_manager) of branch's tenant.
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

  const { data: sub } = await admin
    .from("branch_subscriptions").select("stripe_customer_id").eq("branch_id", branch.id).maybeSingle();
  if (!sub?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: "No Stripe customer on file for this branch yet." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: body.return_url,
    });
    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("portal session error", e);
    return new Response(JSON.stringify({ error: e.message || "Stripe error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
