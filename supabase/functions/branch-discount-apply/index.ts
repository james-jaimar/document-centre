// Validate + apply (or remove) a branch discount code against a cart order.
// Also supports `evaluate_auto` to find the best applicable automatic special.
//
// After mutating orders.discount_amount / discount_code / discount_snapshot,
// the order's subtotal / total_amount / amount_due are recomputed inline
// (mirrors order-engine's recomputeAndNotify pattern).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type DiscountRow = {
  id: string;
  branch_id: string;
  tenant_id: string;
  kind: "coupon" | "voucher" | "automatic";
  code: string | null;
  name: string;
  value_type: "percentage" | "fixed" | "free_delivery" | "free_item";
  value_amount: number;
  currency_code: string;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_per_customer: number | null;
  min_order_subtotal: number | null;
  first_time_customer_only: boolean;
  is_active: boolean;
};

type Cart = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  currency: string;
  subtotal: number;
  delivery_amount: number;
  vat_amount: number;
  amount_paid: number;
  discount_amount: number;
  status: string;
  customer_email: string | null;
  ordered_by_profile_id: string | null;
};

async function recomputeTotals(admin: ReturnType<typeof createClient>, orderId: string) {
  const [{ data: jobs }, { data: adjs }, { data: o }] = await Promise.all([
    admin.from("order_jobs").select("net_price").eq("order_id", orderId),
    admin.from("order_adjustments").select("amount").eq("order_id", orderId),
    admin.from("orders")
      .select("discount_amount, delivery_amount, vat_amount, amount_paid")
      .eq("id", orderId).single(),
  ]);
  const jobsTotal = (jobs ?? []).reduce((s, j: any) => s + Number(j.net_price || 0), 0);
  const adjTotal = (adjs ?? []).reduce((s, a: any) => s + Number(a.amount || 0), 0);
  const subtotal = jobsTotal + adjTotal;
  const discount = Number((o as any).discount_amount || 0);
  const delivery = Number((o as any).delivery_amount || 0);
  const vat = Number((o as any).vat_amount || 0);
  const total = Math.max(0, Math.round((subtotal - discount + delivery + vat) * 100) / 100);
  const paid = Number((o as any).amount_paid || 0);
  const due = Math.round((total - paid) * 100) / 100;
  const payment_status = paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial";
  await admin.from("orders").update({
    subtotal, total_amount: total, amount_due: due, payment_status,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId);
  return { subtotal, total, discount };
}

function computeDiscountAmount(
  d: DiscountRow,
  subtotal: number,
  deliveryAmount: number,
): number {
  if (d.value_type === "free_delivery") {
    return Math.min(deliveryAmount, subtotal + deliveryAmount);
  }
  if (d.value_type === "percentage") {
    return Math.round((subtotal * Number(d.value_amount) / 100) * 100) / 100;
  }
  if (d.value_type === "fixed") {
    return Math.min(subtotal, Number(d.value_amount));
  }
  // free_item — treat as fixed value_amount off (branch owner can enter typical item value)
  return Math.min(subtotal, Number(d.value_amount));
}

async function validateDiscount(
  admin: ReturnType<typeof createClient>,
  d: DiscountRow,
  cart: Cart,
  ctx: { customerEmail: string | null; customerUserId: string | null; jobFamilyIds: string[]; deliveryAmount: number },
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const now = new Date();
  if (!d.is_active) return { ok: false, error: "This code is not active" };
  if (d.starts_at && new Date(d.starts_at) > now) return { ok: false, error: "This code is not yet valid" };
  if (d.ends_at && new Date(d.ends_at) < now) return { ok: false, error: "This code has expired" };
  if (d.branch_id !== cart.branch_id) return { ok: false, error: "This code is not valid for this branch" };
  if (d.currency_code && cart.currency && d.currency_code !== cart.currency) {
    return { ok: false, error: "This code is not valid for this currency" };
  }
  if (d.min_order_subtotal && Number(cart.subtotal) < Number(d.min_order_subtotal)) {
    return { ok: false, error: `Minimum order of ${d.currency_code} ${Number(d.min_order_subtotal).toFixed(2)} required` };
  }

  // Product restrictions (if any rows exist, at least one job must match)
  const { data: prodRows } = await admin
    .from("branch_discount_products")
    .select("product_family_id")
    .eq("discount_id", d.id);
  if (prodRows && prodRows.length > 0) {
    const allowed = new Set(prodRows.map((r: any) => r.product_family_id));
    if (!ctx.jobFamilyIds.some((f) => allowed.has(f))) {
      return { ok: false, error: "This code doesn't apply to any items in your cart" };
    }
  }

  // Customer allow-list (vouchers)
  if (d.kind === "voucher") {
    const { data: allowRows } = await admin
      .from("branch_discount_customers")
      .select("customer_user_id, customer_email")
      .eq("discount_id", d.id);
    if (allowRows && allowRows.length > 0) {
      const emailLower = (ctx.customerEmail ?? "").toLowerCase();
      const match = allowRows.some((r: any) =>
        (r.customer_user_id && r.customer_user_id === ctx.customerUserId) ||
        (r.customer_email && String(r.customer_email).toLowerCase() === emailLower),
      );
      if (!match) return { ok: false, error: "This voucher is not linked to your account" };
    }
  }

  // Redemption caps
  if (d.max_redemptions) {
    const { count } = await admin
      .from("branch_discount_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("discount_id", d.id)
      .neq("order_id", cart.id);
    if ((count ?? 0) >= d.max_redemptions) {
      return { ok: false, error: "This code has reached its redemption limit" };
    }
  }
  if (d.max_per_customer && (ctx.customerUserId || ctx.customerEmail)) {
    const q = admin
      .from("branch_discount_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("discount_id", d.id)
      .neq("order_id", cart.id);
    if (ctx.customerUserId) q.eq("customer_user_id", ctx.customerUserId);
    else q.ilike("customer_email", ctx.customerEmail!);
    const { count } = await q;
    if ((count ?? 0) >= d.max_per_customer) {
      return { ok: false, error: "You've already used this code the maximum number of times" };
    }
  }

  // First-time customer rule
  if (d.first_time_customer_only && ctx.customerUserId) {
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", cart.branch_id!)
      .eq("ordered_by_profile_id", ctx.customerUserId)
      .in("admin_status", ["confirmed", "in_production", "ready", "completed"]);
    if ((count ?? 0) > 0) {
      return { ok: false, error: "This code is for first-time customers only" };
    }
  }

  const amount = computeDiscountAmount(d, Number(cart.subtotal || 0), ctx.deliveryAmount);
  if (amount <= 0) return { ok: false, error: "This code would not reduce your order total" };
  return { ok: true, amount };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();

  let body: {
    action: "apply" | "remove" | "evaluate_auto";
    order_id: string;
    code?: string | null;
    delivery_amount?: number;
    customer_email?: string | null;
  };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.order_id) return json({ error: "order_id required" }, 400);

  const { data: cart, error: cartErr } = await admin
    .from("orders")
    .select("id, tenant_id, branch_id, currency, subtotal, delivery_amount, vat_amount, amount_paid, discount_amount, status, customer_email, ordered_by_profile_id")
    .eq("id", body.order_id)
    .single();
  if (cartErr || !cart) return json({ error: "Order not found" }, 404);
  if (cart.status !== "cart") return json({ error: "Order is no longer editable" }, 400);

  const deliveryAmount = Number(body.delivery_amount ?? cart.delivery_amount ?? 0);
  const customerEmail = body.customer_email ?? cart.customer_email ?? user?.email ?? null;
  const customerUserId = cart.ordered_by_profile_id ?? user?.id ?? null;

  // Load line item product families (for product restrictions).
  const { data: jobs } = await admin
    .from("order_jobs")
    .select("product_family_id")
    .eq("order_id", cart.id);
  const jobFamilyIds = (jobs ?? []).map((j: any) => j.product_family_id).filter(Boolean);

  // ── REMOVE ─────────────────────────────────────────────────────
  if (body.action === "remove") {
    await admin.from("orders").update({
      discount_amount: 0, discount_code: null, discount_snapshot: null,
    }).eq("id", cart.id);
    await admin.from("branch_discount_redemptions").delete().eq("order_id", cart.id);
    const totals = await recomputeTotals(admin, cart.id);
    return json({ ok: true, removed: true, totals });
  }

  // ── EVALUATE_AUTO — find best automatic special ────────────────
  if (body.action === "evaluate_auto") {
    if (!cart.branch_id) return json({ ok: true, applied: null });
    const { data: autos } = await admin
      .from("branch_discounts")
      .select("*")
      .eq("branch_id", cart.branch_id)
      .eq("kind", "automatic")
      .eq("is_active", true);
    let best: { d: DiscountRow; amount: number } | null = null;
    for (const d of (autos ?? []) as DiscountRow[]) {
      const v = await validateDiscount(admin, d, cart as Cart, {
        customerEmail, customerUserId, jobFamilyIds, deliveryAmount,
      });
      if (v.ok && (!best || v.amount > best.amount)) best = { d, amount: v.amount };
    }
    if (!best) {
      // Clear any prior auto snapshot but leave manual codes alone.
      // (We only clear if the currently applied one is auto.)
      const { data: cur } = await admin.from("orders")
        .select("discount_snapshot").eq("id", cart.id).single();
      const snap = (cur as any)?.discount_snapshot;
      if (snap && snap.kind === "automatic") {
        await admin.from("orders").update({
          discount_amount: 0, discount_code: null, discount_snapshot: null,
        }).eq("id", cart.id);
        await admin.from("branch_discount_redemptions").delete().eq("order_id", cart.id);
        await recomputeTotals(admin, cart.id);
      }
      return json({ ok: true, applied: null });
    }
    const snapshot = {
      discount_id: best.d.id, kind: best.d.kind, name: best.d.name,
      value_type: best.d.value_type, value_amount: best.d.value_amount,
      amount_applied: best.amount, currency_code: best.d.currency_code,
      applied_at: new Date().toISOString(),
    };
    await admin.from("orders").update({
      discount_amount: best.amount, discount_code: null, discount_snapshot: snapshot,
    }).eq("id", cart.id);
    await admin.from("branch_discount_redemptions")
      .upsert({
        discount_id: best.d.id, branch_id: cart.branch_id!, order_id: cart.id,
        customer_user_id: customerUserId, customer_email: customerEmail,
        amount_applied: best.amount,
      }, { onConflict: "discount_id,order_id" });
    const totals = await recomputeTotals(admin, cart.id);
    return json({ ok: true, applied: snapshot, totals });
  }

  // ── APPLY (code) ───────────────────────────────────────────────
  const code = (body.code ?? "").trim();
  if (!code) return json({ error: "Enter a code" }, 400);
  if (!cart.branch_id) return json({ error: "Cart has no branch" }, 400);

  const { data: found } = await admin
    .from("branch_discounts")
    .select("*")
    .eq("branch_id", cart.branch_id)
    .ilike("code", code)
    .in("kind", ["coupon", "voucher"])
    .maybeSingle();
  if (!found) return json({ error: "Invalid or unknown code" }, 404);

  const d = found as DiscountRow;
  const v = await validateDiscount(admin, d, cart as Cart, {
    customerEmail, customerUserId, jobFamilyIds, deliveryAmount,
  });
  if (!v.ok) return json({ error: v.error }, 400);

  const snapshot = {
    discount_id: d.id, kind: d.kind, name: d.name, code: d.code,
    value_type: d.value_type, value_amount: d.value_amount,
    amount_applied: v.amount, currency_code: d.currency_code,
    applied_at: new Date().toISOString(),
  };
  await admin.from("orders").update({
    discount_amount: v.amount, discount_code: d.code, discount_snapshot: snapshot,
  }).eq("id", cart.id);
  await admin.from("branch_discount_redemptions")
    .upsert({
      discount_id: d.id, branch_id: cart.branch_id!, order_id: cart.id,
      customer_user_id: customerUserId, customer_email: customerEmail,
      amount_applied: v.amount,
    }, { onConflict: "discount_id,order_id" });
  const totals = await recomputeTotals(admin, cart.id);
  return json({ ok: true, applied: snapshot, totals });
});
