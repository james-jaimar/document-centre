// Transfer an order's production to another linked branch within the same tenant.
// The originating branch keeps ownership (customer, invoice, payments).
// Only branch managers/admins/owners with membership on BOTH branches can do this.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MANAGER_ROLES = new Set(["branch_manager", "owner", "admin", "tenant_admin"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let body: { order_id?: string; production_branch_id?: string | null; note?: string | null };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const orderId = body.order_id;
  const targetBranchId = body.production_branch_id ?? null;
  if (!orderId) return json({ error: "order_id required" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Load order
  const { data: order, error: orderErr } = await sb
    .from("orders")
    .select("id, tenant_id, branch_id, production_branch_id, admin_status, order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) return json({ error: "Order not found" }, 404);

  // Load user memberships
  const { data: memberships, error: memErr } = await sb
    .from("tenant_memberships")
    .select("branch_id, role, status, tenant_id")
    .eq("user_id", user.id)
    .eq("tenant_id", order.tenant_id)
    .eq("status", "active");
  if (memErr) return json({ error: memErr.message }, 500);

  const isPlatformAdmin = await sb
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle()
    .then((r) => !!r.data);

  const managerBranchIds = new Set(
    (memberships || [])
      .filter((m: any) => MANAGER_ROLES.has(m.role))
      .map((m: any) => m.branch_id)
      .filter(Boolean)
  );
  const hasTenantWideManager = (memberships || []).some(
    (m: any) => MANAGER_ROLES.has(m.role) && !m.branch_id
  );

  const canManageBranch = (bid: string | null) => {
    if (!bid) return false;
    if (isPlatformAdmin || hasTenantWideManager) return true;
    return managerBranchIds.has(bid);
  };

  // Must be able to manage the owning branch
  if (!canManageBranch(order.branch_id)) {
    return json({ error: "You do not have manager access to this order's branch." }, 403);
  }

  // If assigning a target, must be able to manage that branch too, and it must belong to same tenant
  if (targetBranchId) {
    const { data: targetBranch, error: tbErr } = await sb
      .from("branches")
      .select("id, tenant_id, name")
      .eq("id", targetBranchId)
      .maybeSingle();
    if (tbErr || !targetBranch) return json({ error: "Target branch not found" }, 404);
    if (targetBranch.tenant_id !== order.tenant_id) {
      return json({ error: "Target branch must belong to the same tenant." }, 403);
    }
    if (!canManageBranch(targetBranchId)) {
      return json({ error: "You are not linked as a manager to the target branch." }, 403);
    }
    if (targetBranchId === order.branch_id) {
      // Setting production back to the origin = clear
    }
  }

  // Block after fulfillment
  const blocked = new Set(["completed", "cancelled"]);
  if (blocked.has(order.admin_status)) {
    return json({ error: "Cannot transfer a completed or cancelled order." }, 409);
  }

  const newProdBranch = targetBranchId === order.branch_id ? null : targetBranchId;

  const { error: updErr } = await sb
    .from("orders")
    .update({ production_branch_id: newProdBranch, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (updErr) return json({ error: updErr.message }, 500);

  // Timeline entry (best-effort)
  const targetName = targetBranchId
    ? (await sb.from("branches").select("name").eq("id", targetBranchId).maybeSingle()).data?.name || "another branch"
    : "origin branch";
  await sb.from("order_timeline").insert({
    order_id: orderId,
    tenant_id: order.tenant_id,
    branch_id: order.branch_id,
    event_type: newProdBranch ? "production_transferred" : "production_returned",
    actor_id: user.id,
    payload: {
      target_branch_id: newProdBranch,
      target_branch_name: targetName,
      note: (body.note || "").toString().slice(0, 500) || null,
    },
  }).then(() => {}).catch(() => {});

  return json({
    ok: true,
    order_id: orderId,
    production_branch_id: newProdBranch,
    target_branch_name: targetName,
  });
});
