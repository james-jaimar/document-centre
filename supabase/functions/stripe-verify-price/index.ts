// Platform-only helper: given a Stripe price_id (and optional coupon_id), returns
// authoritative live data (amount, currency, recurrence, product name, coupon
// details) so the platform admin can sanity-check what's stored vs. what Stripe
// actually has live. No DB writes — read-only on Stripe.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Require platform admin
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: user.id });
  if (!isPlatformAdmin) {
    return new Response(JSON.stringify({ error: "Platform admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: { price_id?: string; coupon_id?: string; promotion_code_id?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  const out: any = { price: null, product: null, coupon: null, promotion_code: null, errors: {} };

  if (body.price_id) {
    try {
      const price = await stripe.prices.retrieve(body.price_id, { expand: ["product"] });
      out.price = {
        id: price.id,
        active: price.active,
        currency: price.currency.toUpperCase(),
        unit_amount: price.unit_amount,
        unit_amount_decimal: price.unit_amount != null ? (price.unit_amount / 100).toFixed(2) : null,
        recurring: price.recurring ? { interval: price.recurring.interval, interval_count: price.recurring.interval_count } : null,
      };
      const product = price.product as Stripe.Product;
      out.product = { id: product.id, name: product.name, active: product.active };
    } catch (e: any) {
      out.errors.price = e?.message ?? "Price lookup failed";
    }
  }

  if (body.coupon_id) {
    try {
      const coupon = await stripe.coupons.retrieve(body.coupon_id);
      out.coupon = {
        id: coupon.id,
        name: coupon.name,
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        currency: coupon.currency?.toUpperCase() ?? null,
        duration: coupon.duration,
        duration_in_months: coupon.duration_in_months,
        valid: coupon.valid,
      };
    } catch (couponErr: any) {
      // Fallback: maybe the user pasted a Promotion Code ID instead of a Coupon ID
      try {
        const list = await stripe.promotionCodes.list({ code: body.coupon_id, limit: 1 });
        const pc = list.data[0] ?? (body.coupon_id.startsWith("promo_") ? await stripe.promotionCodes.retrieve(body.coupon_id) : null);
        if (pc) {
          out.promotion_code = { id: pc.id, code: pc.code, active: pc.active, coupon_id: typeof pc.coupon === "string" ? pc.coupon : pc.coupon.id };
          const couponId = typeof pc.coupon === "string" ? pc.coupon : pc.coupon.id;
          const coupon = await stripe.coupons.retrieve(couponId);
          out.coupon = {
            id: coupon.id,
            name: coupon.name,
            percent_off: coupon.percent_off,
            amount_off: coupon.amount_off,
            currency: coupon.currency?.toUpperCase() ?? null,
            duration: coupon.duration,
            duration_in_months: coupon.duration_in_months,
            valid: coupon.valid,
            resolved_via: "promotion_code",
          };
        } else {
          out.errors.coupon = couponErr?.message ?? "Coupon lookup failed";
        }
      } catch (pcErr: any) {
        out.errors.coupon = `${couponErr?.message ?? "Coupon lookup failed"} (promo fallback: ${pcErr?.message ?? "not found"})`;
      }
    }
  }

  if (body.promotion_code_id && !out.promotion_code) {
    try {
      const pc = await stripe.promotionCodes.retrieve(body.promotion_code_id);
      out.promotion_code = { id: pc.id, code: pc.code, active: pc.active, coupon_id: typeof pc.coupon === "string" ? pc.coupon : pc.coupon.id };
    } catch (e: any) {
      out.errors.promotion_code = e?.message ?? "Promotion code lookup failed";
    }
  }

  return new Response(JSON.stringify(out), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
