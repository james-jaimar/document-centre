// Branch financial reports.
// Cash-basis summary + accrual order/VAT lists for a branch over a date range.
//
// Auth: caller must be platform_admin OR tenant owner/admin OR an active
// member of the branch (branch_manager / store_operator). Only branch
// managers (and tenant owners/admins / platform admins) see the reports UI,
// but we still authorize defensively here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Body {
  branch_id?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD inclusive
}

const MANAGER_TENANT_ROLES = new Set(["owner", "admin"]);
const ALLOWED_BRANCH_ROLES = new Set(["branch_manager", "store_operator"]);

function dayKey(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const branchId = body.branch_id;
  if (!branchId) return json({ error: "branch_id required" }, 400);

  // Default window: this month to date.
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultTo = now;
  const fromStr = body.from ?? dayKey(defaultFrom);
  const toStr = body.to ?? dayKey(defaultTo);

  // Build inclusive window in UTC.
  const fromTs = new Date(`${fromStr}T00:00:00.000Z`);
  const toTs = new Date(`${toStr}T23:59:59.999Z`);
  if (Number.isNaN(fromTs.getTime()) || Number.isNaN(toTs.getTime()) || fromTs > toTs) {
    return json({ error: "Invalid date range" }, 400);
  }

  const sb = createClient(url, service);

  const { data: branch, error: branchErr } = await sb
    .from("branches")
    .select("id, tenant_id, name, slug, currency")
    .eq("id", branchId)
    .maybeSingle();
  if (branchErr) return json({ error: branchErr.message }, 500);
  if (!branch) return json({ error: "Branch not found" }, 404);

  // Authorization.
  const { data: platformRole } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "platform_admin")
    .maybeSingle();

  let authorized = !!platformRole;
  if (!authorized) {
    const { data: tenantMembership } = await sb
      .from("tenant_memberships")
      .select("role, branch_id")
      .eq("profile_id", user.id)
      .eq("tenant_id", branch.tenant_id)
      .eq("is_active", true);
    if (tenantMembership?.length) {
      authorized = tenantMembership.some((m: any) => {
        if (MANAGER_TENANT_ROLES.has(m.role)) return true;
        if (!ALLOWED_BRANCH_ROLES.has(m.role)) return false;
        return !m.branch_id || m.branch_id === branchId;
      });
    }
  }
  if (!authorized) return json({ error: "Forbidden" }, 403);

  const { data: tenant } = await sb
    .from("tenants")
    .select("id, name")
    .eq("id", branch.tenant_id)
    .maybeSingle();

  // Pull orders submitted (or, if not submitted, created) inside the window.
  const { data: ordersRows, error: ordersErr } = await sb
    .from("orders")
    .select(
      "id, order_number, created_at, submitted_at, completed_at, order_status, payment_status, customer_name, customer_email, company_name, subtotal, vat_amount, delivery_amount, discount_amount, total_amount, amount_paid, amount_due, currency, fulfillment_type, is_demo"
    )
    .eq("branch_id", branchId)
    .or(`submitted_at.gte.${fromTs.toISOString()},and(submitted_at.is.null,created_at.gte.${fromTs.toISOString()})`)
    .or(`submitted_at.lte.${toTs.toISOString()},and(submitted_at.is.null,created_at.lte.${toTs.toISOString()})`)
    .order("submitted_at", { ascending: true, nullsFirst: false });
  if (ordersErr) return json({ error: ordersErr.message }, 500);

  // Pull payments paid_at in window for the branch's orders. We resolve via order branch_id join.
  // First, get all payments for the branch in the window:
  const { data: paymentRows, error: payErr } = await sb
    .from("payments")
    .select("id, order_id, provider, provider_transaction_id, payment_reference, status, amount, currency, paid_at, initiated_at, created_at")
    .gte("paid_at", fromTs.toISOString())
    .lte("paid_at", toTs.toISOString())
    .in("status", ["paid", "refunded"]);
  if (payErr) return json({ error: payErr.message }, 500);

  // Filter payments to those whose order belongs to this branch.
  const orderIds = new Set<string>((ordersRows ?? []).map((o: any) => o.id));
  // Also fetch any other order numbers we need for payments whose order is not in the window.
  const missingOrderIds = (paymentRows ?? [])
    .filter((p: any) => p.order_id && !orderIds.has(p.order_id))
    .map((p: any) => p.order_id);
  let extraOrders: Record<string, { order_number: string | null; customer_name: string | null; branch_id: string | null }> = {};
  if (missingOrderIds.length) {
    const { data: extras } = await sb
      .from("orders")
      .select("id, order_number, customer_name, branch_id")
      .in("id", Array.from(new Set(missingOrderIds)));
    for (const row of extras ?? []) {
      extraOrders[(row as any).id] = {
        order_number: (row as any).order_number,
        customer_name: (row as any).customer_name,
        branch_id: (row as any).branch_id,
      };
    }
  }

  const orderLookup: Record<string, { order_number: string | null; customer_name: string | null }> = {};
  for (const o of ordersRows ?? []) {
    orderLookup[(o as any).id] = {
      order_number: (o as any).order_number,
      customer_name: (o as any).customer_name,
    };
  }

  const payments = (paymentRows ?? [])
    .filter((p: any) => {
      if (!p.order_id) return false;
      if (orderIds.has(p.order_id)) return true;
      return extraOrders[p.order_id]?.branch_id === branchId;
    })
    .map((p: any) => {
      const meta = orderLookup[p.order_id] ?? extraOrders[p.order_id] ?? { order_number: null, customer_name: null };
      return {
        id: p.id,
        order_id: p.order_id,
        order_number: meta.order_number,
        customer_name: meta.customer_name,
        provider: p.provider ?? "manual",
        provider_transaction_id: p.provider_transaction_id ?? null,
        payment_reference: p.payment_reference ?? null,
        status: p.status,
        amount: num(p.amount),
        currency: p.currency ?? branch.currency ?? "ZAR",
        paid_at: p.paid_at,
      };
    });

  // Summary (CASH basis) from payments.
  let cashGross = 0;
  let cashRefunds = 0;
  for (const p of payments) {
    if (p.status === "refunded" || p.amount < 0) cashRefunds += Math.abs(p.amount);
    else cashGross += p.amount;
  }
  const cashNet = cashGross - cashRefunds;

  // By-day series (cash).
  const dayMap = new Map<string, { date: string; gross: number; refunds: number; net: number; payments: number }>();
  for (const p of payments) {
    const k = dayKey(p.paid_at);
    const row = dayMap.get(k) ?? { date: k, gross: 0, refunds: 0, net: 0, payments: 0 };
    if (p.status === "refunded" || p.amount < 0) row.refunds += Math.abs(p.amount);
    else row.gross += p.amount;
    row.net = row.gross - row.refunds;
    row.payments += 1;
    dayMap.set(k, row);
  }
  const byDay = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // By provider (cash).
  const providerMap = new Map<string, { provider: string; count: number; gross: number; refunds: number; net: number }>();
  for (const p of payments) {
    const row = providerMap.get(p.provider) ?? { provider: p.provider, count: 0, gross: 0, refunds: 0, net: 0 };
    row.count += 1;
    if (p.status === "refunded" || p.amount < 0) row.refunds += Math.abs(p.amount);
    else row.gross += p.amount;
    row.net = row.gross - row.refunds;
    providerMap.set(p.provider, row);
  }
  const byProvider = Array.from(providerMap.values()).sort((a, b) => b.net - a.net);

  // Orders list (accrual). Skip cancelled if you want strict revenue; we keep but flag status.
  const orders = (ordersRows ?? []).map((o: any) => {
    const paidForOrder = payments
      .filter((p) => p.order_id === o.id && p.status === "paid" && p.amount >= 0)
      .reduce((s, p) => s + p.amount, 0);
    const refundedForOrder = payments
      .filter((p) => p.order_id === o.id && (p.status === "refunded" || p.amount < 0))
      .reduce((s, p) => s + Math.abs(p.amount), 0);
    return {
      id: o.id,
      order_number: o.order_number,
      created_at: o.created_at,
      submitted_at: o.submitted_at,
      completed_at: o.completed_at,
      status: o.order_status,
      payment_status: o.payment_status,
      fulfillment_type: o.fulfillment_type,
      customer_name: o.customer_name,
      customer_email: o.customer_email,
      company_name: o.company_name,
      subtotal: num(o.subtotal),
      vat_amount: num(o.vat_amount),
      delivery_amount: num(o.delivery_amount),
      discount_amount: num(o.discount_amount),
      total_amount: num(o.total_amount),
      amount_paid: num(o.amount_paid),
      amount_due: num(o.amount_due),
      paid_in_period: paidForOrder,
      refunded_in_period: refundedForOrder,
      net_in_period: paidForOrder - refundedForOrder,
      currency: o.currency ?? branch.currency ?? "ZAR",
      is_demo: !!o.is_demo,
    };
  });

  // Accrual sales summary (orders submitted in range, excluding cancelled).
  const billable = orders.filter((o) => o.status !== "cancelled" && !o.is_demo);
  const accrualSubtotal = billable.reduce((s, o) => s + o.subtotal, 0);
  const accrualVat = billable.reduce((s, o) => s + o.vat_amount, 0);
  const accrualDelivery = billable.reduce((s, o) => s + o.delivery_amount, 0);
  const accrualDiscount = billable.reduce((s, o) => s + o.discount_amount, 0);
  const accrualTotal = billable.reduce((s, o) => s + o.total_amount, 0);

  const summary = {
    currency: branch.currency ?? "ZAR",
    cash: {
      gross: cashGross,
      refunds: cashRefunds,
      net: cashNet,
      payments_count: payments.length,
    },
    accrual: {
      orders_count: billable.length,
      subtotal: accrualSubtotal,
      vat: accrualVat,
      delivery: accrualDelivery,
      discount: accrualDiscount,
      total: accrualTotal,
      avg_order_value: billable.length ? accrualTotal / billable.length : 0,
    },
  };

  return json({
    meta: {
      branch: { id: branch.id, name: branch.name, slug: branch.slug },
      tenant: { id: tenant?.id ?? null, name: tenant?.name ?? null },
      from: fromStr,
      to: toStr,
      generated_at: new Date().toISOString(),
      basis_note:
        "Cash totals are based on payments (paid_at) within the period. Accrual totals are based on orders submitted within the period (cancelled and demo orders excluded).",
    },
    summary,
    by_day: byDay,
    by_provider: byProvider,
    orders,
    payments,
  });
});
