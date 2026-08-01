import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { adminClient, readSecret } from "../_shared/payments.ts";
import { issueTaxInvoiceAndNotify } from "../_shared/payment-invoice.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const rawBody = await req.text();
  // Tenant-routed webhook: parse the event without verifying first to learn the tenant_id
  // from metadata, then verify the signature using that tenant's webhook secret.
  let event: Stripe.Event;
  try {
    event = JSON.parse(rawBody) as Stripe.Event;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // Tenant id discovery: most events carry our metadata (checkout sessions
  // we created), but refund events come from `charge.refunded` /
  // `refund.updated` where metadata lives in different places.
  const obj: any = event.data?.object ?? {};
  const tenantId =
    obj?.metadata?.tenant_id ||
    obj?.charge?.metadata?.tenant_id ||
    obj?.payment_intent?.metadata?.tenant_id ||
    null;

  // For refund events we may need to look up tenant from our payments table
  // via payment_intent / charge id when metadata is absent.
  const sb = adminClient();
  let resolvedTenant = tenantId;
  if (!resolvedTenant && (event.type === "charge.refunded" || event.type === "refund.updated")) {
    const pi: string | null = obj?.payment_intent || obj?.charge?.payment_intent || null;
    if (pi) {
      const { data } = await sb
        .from("payments")
        .select("tenant_id")
        .eq("provider_payment_intent_id", pi)
        .limit(1)
        .maybeSingle();
      if (data?.tenant_id) resolvedTenant = data.tenant_id;
    }
  }
  if (!resolvedTenant) return new Response("Missing tenant_id", { status: 400 });

  const { data: tpg } = await sb
    .from("tenant_payment_gateways")
    .select("credentials_secret_id")
    .eq("tenant_id", resolvedTenant)
    .eq("provider", "stripe")
    .maybeSingle();
  if (!tpg?.credentials_secret_id) return new Response("Tenant Stripe not configured", { status: 400 });

  const creds = await readSecret(tpg.credentials_secret_id);
  if (!creds?.secret_key || !creds?.webhook_secret) {
    return new Response("Stripe credentials incomplete", { status: 400 });
  }

  const stripe = new Stripe(creds.secret_key, { apiVersion: "2023-10-16" });
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, creds.webhook_secret);
  } catch (err) {
    console.error("Stripe signature verify failed", err);
    return new Response("Bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const amount = (s.amount_total ?? 0) / 100;
    const orderId = s.metadata?.order_id;
    const attemptId = s.metadata?.attempt_id;
    if (!orderId || !attemptId) return new Response("Missing metadata", { status: 400 });

    await sb.from("order_payment_attempts").update({
      status: "succeeded",
      provider_session_id: s.id,
      raw_payload: event as unknown as Record<string, unknown>,
    }).eq("id", attemptId);

    await sb.from("orders").update({
      payment_status: "paid",
      amount_paid: amount,
      amount_due: 0,
    }).eq("id", orderId);

    // Record canonical payments row so refunds can find the payment_intent.
    const paymentIntent =
      typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;

    const { data: order } = await sb
      .from("orders")
      .select("app_id, tenant_id, branch_id")
      .eq("id", orderId)
      .maybeSingle();

    if (order) {
      // De-dupe by session id in metadata so retries don't insert twice.
      const { data: existing } = await sb
        .from("payments")
        .select("id")
        .eq("order_id", orderId)
        .eq("provider", "stripe")
        .contains("metadata", { stripe_session_id: s.id })
        .maybeSingle();
      if (!existing) {
        await sb.from("payments").insert({
          order_id: orderId,
          app_id: (order as any).app_id,
          tenant_id: (order as any).tenant_id,
          provider: "stripe",
          provider_transaction_id: paymentIntent,
          provider_payment_intent_id: paymentIntent,
          payment_reference: s.id,
          status: "paid",
          amount,
          currency: (s.currency || "zar").toUpperCase(),
          paid_at: new Date().toISOString(),
          raw_payload: event as unknown as Record<string, unknown>,
          metadata: { stripe_session_id: s.id, source: "checkout_webhook" },
        });
      } else if (paymentIntent) {
        await sb
          .from("payments")
          .update({ provider_payment_intent_id: paymentIntent, provider_transaction_id: paymentIntent })
          .eq("id", (existing as any).id);
      }
    }

    // Issue the tax invoice + payment_received email (best-effort).
    await issueTaxInvoiceAndNotify(sb, orderId);
  } else if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
    const s = event.data.object as any;
    const attemptId = s?.metadata?.attempt_id;
    if (attemptId) {
      await sb.from("order_payment_attempts").update({
        status: event.type.includes("expired") ? "cancelled" : "failed",
        raw_payload: event as unknown as Record<string, unknown>,
      }).eq("id", attemptId);
    }
  } else if (event.type === "charge.refunded" || event.type === "refund.updated") {
    // Async confirmation of a Stripe refund — flip the matching payments
    // row to `refunded` and clear the matching `refund_pending` adjustment.
    const refund: any = event.type === "refund.updated" ? obj : (obj.refunds?.data?.[0] ?? null);
    const refundId: string | null = refund?.id ?? obj?.refund_id ?? null;
    const refundStatus: string = refund?.status || obj?.status || "succeeded";
    const adjustmentId: string | null =
      refund?.metadata?.adjustment_id ||
      obj?.metadata?.adjustment_id ||
      null;

    if (refundId && refundStatus === "succeeded") {
      // Mark refund payments row.
      const { data: paymentRow } = await sb
        .from("payments")
        .select("id, order_id, amount, tenant_id")
        .eq("provider_refund_id", refundId)
        .maybeSingle();

      if (paymentRow) {
        await sb.from("payments").update({
          status: "refunded",
          paid_at: new Date().toISOString(),
          raw_payload: event as unknown as Record<string, unknown>,
        }).eq("id", (paymentRow as any).id);

        // Decrement order.amount_paid by abs(amount).
        const orderId = (paymentRow as any).order_id;
        const refundedAmt = Math.abs(Number((paymentRow as any).amount || 0));
        const { data: oRow } = await sb.from("orders").select("amount_paid").eq("id", orderId).maybeSingle();
        const newPaid = Math.max(Number((oRow as any)?.amount_paid || 0) - refundedAmt, 0);
        await sb.from("orders").update({ amount_paid: newPaid }).eq("id", orderId);
      }

      if (adjustmentId) {
        await sb.from("order_adjustments").update({
          status: "refunded",
          metadata: { auto_refunded: true, provider: "stripe", provider_refund_id: refundId, confirmed_at: new Date().toISOString() },
        }).eq("id", adjustmentId).eq("status", "refund_pending");
      }
    } else if (refundId && (refundStatus === "failed" || refundStatus === "canceled")) {
      // Leave adjustment pending; surface the failure to the timeline.
      if (adjustmentId) {
        const { data: adjRow } = await sb.from("order_adjustments").select("metadata, order_id").eq("id", adjustmentId).maybeSingle();
        if (adjRow) {
          await sb.from("order_adjustments").update({
            metadata: { ...((adjRow as any).metadata ?? {}), last_attempt_error: `Stripe refund ${refundStatus}`, last_attempt_at: new Date().toISOString() },
          }).eq("id", adjustmentId);
        }
      }
    }
  }

  return new Response("ok", { status: 200 });
});
