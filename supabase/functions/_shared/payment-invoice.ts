// Shared side effects for a successful ONLINE payment (PayFast ITN / Stripe webhook).
//
// Staff-recorded payments go through order-engine's `recordPaymentEvent`, which
// generates the tax invoice and sends the payment_received email. Provider
// webhooks bypass that path entirely, so they call this helper instead.
//
// All work here is best-effort: a PDF or email failure must never stop the
// webhook from acknowledging the provider.

type AnyClient = {
  from: (table: string) => any;
};

async function callFunction(name: string, body: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[payment-invoice] ${name} failed: ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }
  return await res.json().catch(() => null);
}

/**
 * Issue the tax invoice for a paid order (if one doesn't exist yet) and send
 * the payment_received email with it attached.
 */
export async function issueTaxInvoiceAndNotify(sb: AnyClient, orderId: string): Promise<void> {
  try {
    const { data: existing } = await sb
      .from("order_invoices")
      .select("id")
      .eq("order_id", orderId)
      .eq("kind", "invoice")
      .limit(1)
      .maybeSingle();

    let invoiceId: string | undefined = (existing as any)?.id;

    if (!invoiceId) {
      const result = await callFunction("generate-invoice-pdf", { order_id: orderId, kind: "invoice" });
      invoiceId = (result as any)?.invoice_id;
    }

    await callFunction("send-order-email", {
      order_id: orderId,
      event_key: "payment_received",
      ...(invoiceId ? { invoice_id: invoiceId } : {}),
    });
  } catch (e) {
    console.error("[payment-invoice] issueTaxInvoiceAndNotify failed (non-fatal):", e);
  }
}
