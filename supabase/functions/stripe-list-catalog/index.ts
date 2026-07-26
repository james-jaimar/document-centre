// Read-only lister for Stripe products/prices. Returns a flat list of active
// recurring prices so a platform admin can pick one and attach it to a
// platform_pricing_plans row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function stripeGet(path: string): Promise<{ ok: true; data: any } | { ok: false; error: string; status: number }> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}`, status: res.status };
  return { ok: true, data: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  // Platform admin only — this exposes the full Stripe catalogue.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: platformRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .maybeSingle();
  if (!platformRole) return json({ error: "Forbidden — platform admin only" }, 403);

  const url = new URL(req.url);
  const currencyFilter = (url.searchParams.get("currency") || "").toLowerCase() || null;

  // Pull active prices with expanded products. limit=100 is Stripe's max per page —
  // enough for typical SaaS catalogues; add pagination later if needed.
  const r = await stripeGet(`/prices?active=true&limit=100&expand[]=data.product`);
  if (!r.ok) return json({ error: r.error }, r.status);

  const items = (r.data?.data ?? []).map((price: any) => {
    const product = typeof price.product === "object" ? price.product : null;
    return {
      price_id: price.id,
      product_id: product?.id ?? (typeof price.product === "string" ? price.product : null),
      product_name: product?.name ?? "(unknown product)",
      product_active: product?.active ?? true,
      currency: String(price.currency || "").toUpperCase(),
      unit_amount: price.unit_amount,
      unit_amount_decimal: price.unit_amount != null ? (price.unit_amount / 100).toFixed(2) : null,
      recurring: price.recurring
        ? { interval: price.recurring.interval, interval_count: price.recurring.interval_count }
        : null,
      active: price.active,
      nickname: price.nickname ?? null,
    };
  }).filter((p: any) => {
    if (!p.recurring) return false; // subscriptions only
    if (currencyFilter && p.currency.toLowerCase() !== currencyFilter) return false;
    return true;
  });

  return json({ items });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
