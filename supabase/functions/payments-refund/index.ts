// UI-callable refund retry/trigger. Verifies the caller has staff access
// to the order, then delegates to the shared `processAutoRefund` helper.
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, adminClient, userClient } from "../_shared/payments.ts";
import { processAutoRefund } from "../_shared/refunds.ts";

const BodySchema = z.object({
  adjustment_id: z.string().uuid(),
  amount: z.number().positive().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const sbUser = userClient(authHeader);
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

  const admin = adminClient();

  // Verify staff access via the adjustment → order chain.
  const { data: adj } = await admin
    .from("order_adjustments")
    .select("id, order_id")
    .eq("id", parsed.data.adjustment_id)
    .maybeSingle();
  if (!adj) return json({ error: "Adjustment not found" }, 404);

  const { data: order } = await admin
    .from("orders")
    .select("id, tenant_id, branch_id")
    .eq("id", (adj as any).order_id)
    .single();
  if (!order) return json({ error: "Order not found" }, 404);

  // Allowed: platform admin OR tenant owner/admin/accounts OR branch staff.
  const [{ data: platform }, { data: tm }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "platform_admin").maybeSingle(),
    admin.from("tenant_memberships")
      .select("role, branch_id")
      .eq("profile_id", user.id)
      .eq("tenant_id", (order as any).tenant_id)
      .eq("is_active", true),
  ]);
  const tmRows = (tm as any[]) ?? [];
  const tenantWide = tmRows.some((m: any) =>
    ["owner", "admin", "accounts", "sales", "production"].includes(m.role) && !m.branch_id,
  );
  const branchScoped = tmRows.some((m: any) =>
    m.branch_id && m.branch_id === (order as any).branch_id,
  );
  if (!platform && !tenantWide && !branchScoped) {
    return json({ error: "Forbidden" }, 403);
  }

  const result = await processAutoRefund(admin, {
    adjustment_id: parsed.data.adjustment_id,
    amount: parsed.data.amount,
    actor_id: user.id,
    reason: "UI refund trigger",
  });

  if (!result.ok) {
    return json({ error: result.error, outcome: result.outcome, provider: result.provider }, 400);
  }
  return json(result);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
