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
    price_id: string;
    success_url: string;
    cancel_url: string;
    discount_type?: string | null;
    discount_value?: number;
    trial_days?: number;
    acceptances?: { slug: string; version: number }[];
  };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.branch_id || !body.price_id || !body.success_url || !body.cancel_url) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const REQUIRED_DOCS = ["terms", "privacy", "dpa", "billing"];
  const acceptedSlugs = new Set((body.acceptances ?? []).map((a) => a.slug));
  const missing = REQUIRED_DOCS.filter((s) => !acceptedSlugs.has(s));
  if (missing.length > 0) {
    return new Response(JSON.stringify({ error: `Missing acceptance for: ${missing.join(", ")}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: branch, error: branchErr } = await supabaseAdmin
    .from("branches")
    .select("id, tenant_id, name, trading_name, email")
    .eq("id", body.branch_id)
    .single();
  if (branchErr || !branch) {
    return new Response(JSON.stringify({ error: "Branch not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: platformRole } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle();
  const { data: tenantMembership } = await supabaseAdmin
    .from("tenant_memberships").select("role, branch_id")
    .eq("profile_id", user.id).eq("tenant_id", branch.tenant_id).eq("is_active", true);
  const isTenantAdmin = (tenantMembership ?? []).some((m: any) => m.role === "owner" || m.role === "admin");
  const isBranchManager = (tenantMembership ?? []).some((m: any) => m.role === "branch_manager" && m.branch_id === branch.id);
  if (!platformRole && !isTenantAdmin && !isBranchManager) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: existing } = await supabaseAdmin
    .from("branch_subscriptions" as any)
    .select("stripe_customer_id, discount_type, discount_value, trial_days")
    .eq("branch_id", branch.id)
    .maybeSingle();

  let customerId = (existing as any)?.stripe_customer_id;
  if (!customerId) {
    const { data: bp } = await supabaseAdmin.from("branch_private" as any).select("billing_email").eq("branch_id", branch.id).maybeSingle();
    const customer = await stripe.customers.create({
      email: (bp as any)?.billing_email || (branch as any).email || user.email,
      name: (branch as any).trading_name || branch.name,
      metadata: { branch_id: branch.id, tenant_id: branch.tenant_id },
    });
    customerId = customer.id;
    await supabaseAdmin.from("branch_subscriptions" as any).upsert({
      branch_id: branch.id,
      tenant_id: branch.tenant_id,
      stripe_customer_id: customerId,
      status: "incomplete",
      billing_status: "pending_payment",
    }, { onConflict: "branch_id" });
  }

  const { data: plan } = await supabaseAdmin
    .from("platform_pricing_plans")
    .select("plan_slug, trial_offer, stripe_coupon_id, stripe_promotion_code_id")
    .eq("stripe_price_id", body.price_id)
    .maybeSingle();

  const trialOffer = (plan as any)?.trial_offer ?? "both";
  const planCouponId = (plan as any)?.stripe_coupon_id ?? null;
  const planPromoCodeId = (plan as any)?.stripe_promotion_code_id ?? null;

  const discountType = body.discount_type ?? (existing as any)?.discount_type ?? null;
  const discountValue = body.discount_value ?? (existing as any)?.discount_value ?? 0;
  const trialDays = body.trial_days ?? (existing as any)?.trial_days ?? 0;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: body.price_id, quantity: 1 }],
    success_url: body.success_url,
    cancel_url: body.cancel_url,
    subscription_data: {
      metadata: {
        branch_id: branch.id,
        tenant_id: branch.tenant_id,
        plan_slug: plan?.plan_slug || "branch",
      },
    },
    metadata: { branch_id: branch.id, tenant_id: branch.tenant_id },
  };
  if (trialDays > 0) {
    if (trialDays >= 30 && trialOffer !== "trial_30_with_card" && trialOffer !== "both") {
      return new Response(JSON.stringify({ error: "30-day trial is not offered on this plan" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    sessionParams.subscription_data!.trial_period_days = trialDays;
    await supabaseAdmin.from("branch_subscriptions" as any)
      .update({ trial_started_via: "stripe_30" })
      .eq("branch_id", branch.id);
  }

  // Discount priority: (1) plan-level Stripe promotion code, (2) plan-level Stripe coupon,
  // (3) per-branch ad-hoc discount fields, (4) allow customer-typed promotion codes.
  if (planPromoCodeId) {
    sessionParams.discounts = [{ promotion_code: planPromoCodeId }];
  } else if (planCouponId) {
    sessionParams.discounts = [{ coupon: planCouponId }];
  } else if (discountType && discountValue > 0) {
    try {
      let couponParams: Stripe.CouponCreateParams;
      if (discountType === "percentage") {
        couponParams = { percent_off: discountValue, duration: "forever", name: `${discountValue}% off - ${branch.name}` };
      } else if (discountType === "fixed_amount") {
        const price = await stripe.prices.retrieve(body.price_id);
        couponParams = { amount_off: Math.round(discountValue * 100), currency: price.currency, duration: "forever", name: `${discountValue} off - ${branch.name}` };
      } else if (discountType === "free_months") {
        couponParams = { percent_off: 100, duration: "repeating", duration_in_months: discountValue, name: `${discountValue} free months - ${branch.name}` };
      } else {
        couponParams = { percent_off: 0, duration: "once" };
      }
      const coupon = await stripe.coupons.create(couponParams);
      sessionParams.discounts = [{ coupon: coupon.id }];
    } catch (e) {
      console.error("Coupon creation failed:", e);
    }
  } else {
    sessionParams.allow_promotion_codes = true;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  // Record acceptances in the immutable ledger. We log but don't block checkout if this fails.
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;
    const rows = (body.acceptances ?? []).map((a) => ({
      branch_id: branch.id,
      tenant_id: branch.tenant_id,
      accepted_by: user.id,
      document_slug: a.slug,
      document_version: a.version,
      ip_address: ip,
      user_agent: ua,
      context: "branch_checkout",
      stripe_checkout_session_id: session.id,
    }));
    if (rows.length > 0) {
      const { error: accErr } = await supabaseAdmin.from("subscription_acceptances" as any).insert(rows);
      if (accErr) console.error("subscription_acceptances insert failed:", accErr);
    }
  } catch (e) {
    console.error("Failed to log acceptances:", e);
  }

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
