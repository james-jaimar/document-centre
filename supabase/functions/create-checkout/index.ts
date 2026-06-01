import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Authenticate caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse body
  let body: {
    tenant_id: string;
    price_id: string;
    success_url: string;
    cancel_url: string;
    discount_type?: string | null;
    discount_value?: number;
    trial_days?: number;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.tenant_id || !body.price_id || !body.success_url || !body.cancel_url) {
    return new Response(JSON.stringify({ error: "Missing required fields: tenant_id, price_id, success_url, cancel_url" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify caller is tenant owner/admin or platform admin
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: membership } = await supabaseAdmin
    .from("tenant_memberships")
    .select("role")
    .eq("profile_id", user.id)
    .eq("tenant_id", body.tenant_id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  const { data: platformRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .maybeSingle();

  if (!membership && !platformRole) {
    return new Response(JSON.stringify({ error: "Only tenant owners/admins or platform admins can create checkout sessions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Look up tenant for metadata
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("name, slug")
    .eq("id", body.tenant_id)
    .single();

  // Get or create Stripe Customer
  const { data: existingSub } = await supabaseAdmin
    .from("tenant_subscriptions")
    .select("stripe_customer_id")
    .eq("tenant_id", body.tenant_id)
    .maybeSingle();

  let customerId = existingSub?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: tenant?.name || undefined,
      metadata: {
        tenant_id: body.tenant_id,
        tenant_slug: tenant?.slug || "",
        legal_entity: "Jaimar Developments Ltd",
        company_number: "17071122",
        trading_name: "Document Centre",
      },
    });
    customerId = customer.id;

    // Pre-create/update subscription record
    await supabaseAdmin.from("tenant_subscriptions").upsert({
      tenant_id: body.tenant_id,
      stripe_customer_id: customerId,
      plan_slug: "starter",
      status: "incomplete",
    }, { onConflict: "tenant_id" });
  }

  // Look up plan_slug from platform_pricing_plans
  const { data: plan } = await supabaseAdmin
    .from("platform_pricing_plans")
    .select("plan_slug")
    .eq("stripe_price_id", body.price_id)
    .maybeSingle();

  // Build checkout session params
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: body.price_id, quantity: 1 }],
    success_url: body.success_url,
    cancel_url: body.cancel_url,
    subscription_data: {
      description: "Document Centre subscription — Jaimar Developments Ltd t/a Document Centre",
      metadata: {
        tenant_id: body.tenant_id,
        plan_slug: plan?.plan_slug || "starter",
        legal_entity: "Jaimar Developments Ltd",
        company_number: "17071122",
        trading_name: "Document Centre",
      },
    },
    metadata: {
      tenant_id: body.tenant_id,
      legal_entity: "Jaimar Developments Ltd",
      company_number: "17071122",
    },
  };

  // Add trial period if specified
  if (body.trial_days && body.trial_days > 0) {
    sessionParams.subscription_data!.trial_period_days = body.trial_days;
  }

  // Create Stripe coupon for discounts
  if (body.discount_type && body.discount_value && body.discount_value > 0) {
    try {
      let couponParams: Stripe.CouponCreateParams;

      if (body.discount_type === "percentage") {
        couponParams = {
          percent_off: body.discount_value,
          duration: "forever",
          name: `${body.discount_value}% off - ${tenant?.name || body.tenant_id}`,
        };
      } else if (body.discount_type === "fixed_amount") {
        // Look up the price to get the currency
        const price = await stripe.prices.retrieve(body.price_id);
        couponParams = {
          amount_off: Math.round(body.discount_value * 100), // Stripe expects cents
          currency: price.currency,
          duration: "forever",
          name: `${body.discount_value} off - ${tenant?.name || body.tenant_id}`,
        };
      } else if (body.discount_type === "free_months") {
        couponParams = {
          percent_off: 100,
          duration: "repeating",
          duration_in_months: body.discount_value,
          name: `${body.discount_value} free months - ${tenant?.name || body.tenant_id}`,
        };
      } else {
        couponParams = { percent_off: 0, duration: "once" };
      }

      const coupon = await stripe.coupons.create(couponParams);
      sessionParams.discounts = [{ coupon: coupon.id }];
    } catch (couponErr) {
      console.error("Failed to create Stripe coupon:", couponErr);
      // Continue without discount rather than failing the whole checkout
    }
  }

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create(sessionParams);

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
