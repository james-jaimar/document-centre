import { corsHeaders, userClient, resolveGatewaysForOrder } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }
  const sbUser = userClient(authHeader);
  const { data: { user }, error: authErr } = await sbUser.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const orderId = url.searchParams.get("order_id");
  if (!orderId) return json({ error: "order_id required" }, 400);

  try {
    const { order, gateways } = await resolveGatewaysForOrder(orderId);

    // Caller must be the order owner OR staff. RLS on orders already enforces this on the
    // user-scoped client, so re-fetch via user client to validate access.
    const { data: visible } = await sbUser.from("orders").select("id").eq("id", orderId).maybeSingle();
    if (!visible) return json({ error: "Forbidden" }, 403);

    return json({
      order: { id: order.id, currency: order.currency, amount_due: order.amount_due, total_amount: order.total_amount },
      providers: gateways.map((g) => ({
        provider: g.provider,
        mode: g.mode,
        source: g.source,
        display_label: g.displayLabel ?? defaultLabel(g.provider),
      })),
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});

function defaultLabel(p: string) {
  return p === "stripe" ? "Pay by Card (Stripe)" : "Pay with PayFast";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
