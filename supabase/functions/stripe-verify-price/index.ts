// Read-only Stripe verifier. Returns live price / coupon / promo-code data for
// platform admins and tenant admins. Uses direct fetch against the
// Stripe REST API to avoid Stripe-SDK Deno-compat issues.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function stripeGet(path: string): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, data: json };
}

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

  let body: { price_id?: string; coupon_id?: string; promotion_code_id?: string; tenant_id?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  // Allow platform admins OR active tenant admins (read-only Stripe lookup is safe).
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: user.id });
  let allowed = !!isPlatformAdmin;
  if (!allowed) {
    let membershipQuery = admin
      .from("tenant_memberships")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .in("role", ["admin"])
      .limit(1);

    if (body.tenant_id) {
      membershipQuery = membershipQuery.eq("tenant_id", body.tenant_id);
    }

    const { data: memberships } = await membershipQuery;
    allowed = !!(memberships && memberships.length > 0);
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden — platform admin or active tenant admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const out: any = { price: null, product: null, coupon: null, promotion_code: null, errors: {} };

  if (body.price_id) {
    const r = await stripeGet(`/prices/${encodeURIComponent(body.price_id)}?expand[]=product`);
    if (r.ok) {
      const price = r.data;
      out.price = {
        id: price.id,
        active: price.active,
        currency: String(price.currency || "").toUpperCase(),
        unit_amount: price.unit_amount,
        unit_amount_decimal: price.unit_amount != null ? (price.unit_amount / 100).toFixed(2) : null,
        recurring: price.recurring ? { interval: price.recurring.interval, interval_count: price.recurring.interval_count } : null,
      };
      const product = price.product;
      if (product && typeof product === "object") {
        out.product = { id: product.id, name: product.name, active: product.active };
      }
    } else {
      out.errors.price = r.error;
    }
  }

  if (body.coupon_id) {
    const r = await stripeGet(`/coupons/${encodeURIComponent(body.coupon_id)}`);
    if (r.ok) {
      const c = r.data;
      out.coupon = {
        id: c.id, name: c.name, percent_off: c.percent_off, amount_off: c.amount_off,
        currency: c.currency ? String(c.currency).toUpperCase() : null,
        duration: c.duration, duration_in_months: c.duration_in_months, valid: c.valid,
      };
    } else {
      // Fallback: maybe it's a promotion code ID or code string
      let pc: any = null;
      let pcErr = "";
      if (body.coupon_id.startsWith("promo_")) {
        const pr = await stripeGet(`/promotion_codes/${encodeURIComponent(body.coupon_id)}`);
        if (pr.ok) pc = pr.data; else pcErr = pr.error;
      } else {
        const pr = await stripeGet(`/promotion_codes?code=${encodeURIComponent(body.coupon_id)}&limit=1`);
        if (pr.ok) pc = pr.data?.data?.[0] ?? null; else pcErr = pr.error;
      }
      if (pc) {
        const couponId = typeof pc.coupon === "string" ? pc.coupon : pc.coupon?.id;
        out.promotion_code = { id: pc.id, code: pc.code, active: pc.active, coupon_id: couponId };
        if (couponId) {
          const cr = await stripeGet(`/coupons/${encodeURIComponent(couponId)}`);
          if (cr.ok) {
            const c = cr.data;
            out.coupon = {
              id: c.id, name: c.name, percent_off: c.percent_off, amount_off: c.amount_off,
              currency: c.currency ? String(c.currency).toUpperCase() : null,
              duration: c.duration, duration_in_months: c.duration_in_months, valid: c.valid,
              resolved_via: "promotion_code",
            };
          }
        }
      } else {
        out.errors.coupon = `${r.error}${pcErr ? ` (promo fallback: ${pcErr})` : ""}`;
      }
    }
  }

  if (body.promotion_code_id && !out.promotion_code) {
    const r = await stripeGet(`/promotion_codes/${encodeURIComponent(body.promotion_code_id)}`);
    if (r.ok) {
      const pc = r.data;
      out.promotion_code = { id: pc.id, code: pc.code, active: pc.active, coupon_id: typeof pc.coupon === "string" ? pc.coupon : pc.coupon?.id };
    } else {
      out.errors.promotion_code = r.error;
    }
  }

  return new Response(JSON.stringify(out), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
