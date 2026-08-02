// Activation of a "held" order (created for an online payment handoff but not
// yet announced to anyone).
//
// Held orders are inserted by order-engine's createOrderWithJobs with
// `hold_for_payment: true`:
//   admin_status = 'pending_payment', customer_status = 'pending_payment',
//   submitted_at = null, metadata.payment_hold = true.
//
// While held they are invisible to branch/admin queues (which all filter on
// `submitted_at is not null`), no proforma is generated and no email is sent,
// and the customer's cart is left completely untouched so an abandoned or
// failed gateway payment costs them nothing.
//
// Activation happens when — and only when — money is confirmed (PayFast ITN /
// Stripe webhook) or the customer explicitly falls back to EFT. It is
// idempotent: repeated calls (webhook retries) are no-ops.

type AnyClient = { from: (table: string) => any };

async function callFunction(name: string, body: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[activate-held-order] ${name} failed: ${res.status} ${await res.text().catch(() => "")}`);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (e) {
    console.error(`[activate-held-order] ${name} threw:`, e);
    return null;
  }
}

/** Delete the cart order (and its items/sections) this held order was built from. */
export async function clearCartForOrder(sb: AnyClient, cartOrderId: string | null | undefined) {
  if (!cartOrderId) return;
  try {
    const { data: items } = await sb.from("order_items").select("id").eq("order_id", cartOrderId);
    const itemIds = (items ?? []).map((i: any) => i.id);
    if (itemIds.length) {
      await sb.from("document_sections").delete().in("order_item_id", itemIds);
      await sb.from("documents").delete().in("order_item_id", itemIds);
      await sb.from("order_items").delete().in("id", itemIds);
    }
    await sb.from("order_addresses").delete().eq("order_id", cartOrderId);
    await sb.from("orders").delete().eq("id", cartOrderId);
  } catch (e) {
    console.error("[activate-held-order] cart cleanup failed (non-fatal):", e);
  }
}

export interface ActivateResult {
  activated: boolean;
  reason?: string;
}

/**
 * Promote a held order into a real, submitted order.
 *
 * @param reason 'paid' when a gateway confirmed payment, 'eft' when the
 *               customer switched to offline payment.
 */
export async function activateHeldOrder(
  sb: AnyClient,
  orderId: string,
  reason: "paid" | "eft",
): Promise<ActivateResult> {
  const { data: order } = await sb
    .from("orders")
    .select("id, admin_status, customer_status, submitted_at, metadata, payment_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { activated: false, reason: "not_found" };

  const isHeld = order.admin_status === "pending_payment" || !order.submitted_at;
  if (!isHeld) return { activated: false, reason: "already_active" };

  const metadata = { ...(order.metadata ?? {}) } as Record<string, unknown>;
  const cartOrderId = (metadata.cart_order_id as string | undefined) ?? null;
  metadata.payment_hold = false;
  metadata.activated_at = new Date().toISOString();
  metadata.activated_reason = reason;

  // Guard against concurrent webhook retries: only the update that still sees
  // the order as held wins.
  const { data: updated, error } = await sb
    .from("orders")
    .update({
      admin_status: "new_order",
      customer_status: "awaiting_payment",
      submitted_at: new Date().toISOString(),
      metadata,
    })
    .eq("id", orderId)
    .eq("admin_status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[activate-held-order] update failed:", error);
    return { activated: false, reason: "update_failed" };
  }
  if (!updated) return { activated: false, reason: "already_active" };

  // Now that it's a real order, clear the cart it came from.
  await clearCartForOrder(sb, cartOrderId);

  // Proforma + "order received" confirmation, exactly once.
  // For paid orders the caller also issues the tax invoice afterwards.
  const inv = await callFunction("generate-invoice-pdf", { order_id: orderId, kind: "proforma" });
  await callFunction("send-order-email", {
    order_id: orderId,
    event_key: "order_received",
    ...((inv as any)?.invoice_id ? { invoice_id: (inv as any).invoice_id } : {}),
  });

  return { activated: true };
}
