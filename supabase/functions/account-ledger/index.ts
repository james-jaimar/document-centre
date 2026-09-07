// Trade account ledger: record payments and adjustments against a business
// (or an individual credit facility), allocating payments to unpaid on-account
// orders so the order records and the running balance never drift apart.
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

const STAFF_ROLES = ["owner", "admin", "sales", "accounts", "production"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData } = await anon.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const body = await req.json();
    const action: string = body?.action;
    const tenantId: string = body?.tenant_id;
    const appId: string = body?.app_id;
    const companyId: string | null = body?.company_id ?? null;
    const profileId: string | null = body?.customer_profile_id ?? null;
    const branchId: string | null = body?.branch_id ?? null;

    if (!action || !tenantId || !appId) return json({ error: "Missing action/tenant_id/app_id" }, 400);
    if (!companyId && !profileId) return json({ error: "Missing company_id or customer_profile_id" }, 400);

    // Authorisation: platform admin, or staff of this tenant.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "platform_admin")
      .maybeSingle();
    let allowed = !!roleRow;
    if (!allowed) {
      const { data: mems } = await admin
        .from("tenant_memberships")
        .select("role, is_active, branch_id")
        .eq("tenant_id", tenantId)
        .eq("profile_id", user.id)
        .eq("is_active", true);
      allowed = (mems ?? []).some((m: any) => STAFF_ROLES.includes(m.role));
    }
    if (!allowed) return json({ error: "Not allowed to post to this account" }, 403);

    const target = companyId
      ? { company_id: companyId, customer_profile_id: null }
      : { company_id: null, customer_profile_id: profileId };

    const currency: string = body?.currency ?? "ZAR";
    const entryDate: string = body?.entry_date ?? new Date().toISOString().slice(0, 10);

    if (action === "record_adjustment") {
      const kind: string = body?.entry_type; // credit_note | opening_balance
      if (!["credit_note", "opening_balance"].includes(kind)) {
        return json({ error: "entry_type must be credit_note or opening_balance" }, 400);
      }
      const amount = Number(body?.amount ?? 0);
      if (!Number.isFinite(amount) || amount === 0) return json({ error: "Enter an amount" }, 400);
      // Credit notes reduce what is owed; an opening balance is taken as given.
      const signed = kind === "credit_note" ? -Math.abs(amount) : amount;
      const { error } = await admin.from("customer_account_ledger").insert({
        tenant_id: tenantId,
        app_id: appId,
        branch_id: branchId,
        ...target,
        entry_type: kind,
        amount: signed,
        currency,
        reference: body?.reference ?? null,
        note: body?.note ?? null,
        entry_date: entryDate,
        created_by: user.id,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action !== "record_payment") return json({ error: `Unknown action: ${action}` }, 400);

    const reference: string | null = body?.reference ?? null;
    const orderIds: string[] = Array.isArray(body?.order_ids) ? body.order_ids : [];
    let amount = Number(body?.amount ?? 0);

    // Which orders does this payment settle? Either the ones picked, or the
    // oldest unpaid on-account orders first.
    let q = admin
      .from("orders")
      .select("id, order_number, total_amount, amount_paid, currency, created_at")
      .eq("tenant_id", tenantId)
      .neq("payment_status", "paid")
      .order("created_at", { ascending: true });
    if (companyId) {
      const { data: profs } = await admin
        .from("tenant_memberships")
        .select("profile_id")
        .eq("tenant_id", tenantId)
        .eq("company_id", companyId);
      const ids = (profs ?? []).map((p: any) => p.profile_id).filter(Boolean);
      if (!ids.length) q = q.eq("ordered_by_profile_id", "00000000-0000-0000-0000-000000000000");
      else q = q.in("ordered_by_profile_id", ids);
    } else {
      q = q.eq("ordered_by_profile_id", profileId!);
    }
    if (orderIds.length) q = q.in("id", orderIds);

    const { data: candidates, error: ordErr } = await q;
    if (ordErr) return json({ error: ordErr.message }, 400);

    const open = (candidates ?? []).filter(
      (o: any) => Number(o.total_amount ?? 0) - Number(o.amount_paid ?? 0) > 0.005,
    );

    if (orderIds.length && !body?.amount) {
      amount = open.reduce(
        (s: number, o: any) => s + (Number(o.total_amount ?? 0) - Number(o.amount_paid ?? 0)),
        0,
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Enter an amount" }, 400);

    // Allocate oldest first.
    let remaining = amount;
    const allocations: { order_id: string; order_number: string; amount: number }[] = [];
    for (const o of open) {
      if (remaining <= 0.005) break;
      const due = Number(o.total_amount ?? 0) - Number(o.amount_paid ?? 0);
      const alloc = Math.min(due, remaining);
      remaining -= alloc;
      allocations.push({ order_id: o.id, order_number: o.order_number, amount: alloc });
    }

    for (const a of allocations) {
      await admin.from("payments").insert({
        order_id: a.order_id,
        app_id: appId,
        tenant_id: tenantId,
        provider: "account",
        status: "paid",
        amount: a.amount,
        currency,
        payment_reference: reference,
        paid_at: new Date(`${entryDate}T12:00:00Z`).toISOString(),
        raw_payload: {},
        metadata: { source: "account_ledger", posted_by: user.id },
      });
    }

    const { error: ledErr } = await admin.from("customer_account_ledger").insert({
      tenant_id: tenantId,
      app_id: appId,
      branch_id: branchId,
      ...target,
      entry_type: "payment",
      amount: -Math.abs(amount),
      currency,
      reference,
      note: body?.note ?? (allocations.length
        ? `Payment allocated to ${allocations.map((a) => a.order_number).join(", ")}`
        : "Payment on account"),
      entry_date: entryDate,
      created_by: user.id,
    });
    if (ledErr) return json({ error: ledErr.message }, 400);

    return json({ ok: true, allocations, unallocated: Math.max(0, remaining) });
  } catch (e) {
    console.error("[account-ledger]", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
