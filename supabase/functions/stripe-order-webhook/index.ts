import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { adminClient, readSecret } from "../_shared/payments.ts";

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

  const session = (event.data?.object ?? {}) as Stripe.Checkout.Session & { metadata?: Record<string, string> };
  const tenantId = session.metadata?.tenant_id;
  const orderId = session.metadata?.order_id;
  const attemptId = session.metadata?.attempt_id;
  if (!tenantId || !orderId || !attemptId) {
    return new Response("Missing metadata", { status: 400 });
  }

  const sb = adminClient();
  const { data: tpg } = await sb
    .from("tenant_payment_gateways")
    .select("credentials_secret_id")
    .eq("tenant_id", tenantId)
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

    await sb.from("order_payment_attempts").update({
      status: "succeeded",
      raw_payload: event as unknown as Record<string, unknown>,
    }).eq("id", attemptId);

    await sb.from("orders").update({
      payment_status: "paid",
      amount_paid: amount,
      amount_due: 0,
    }).eq("id", orderId);
  } else if (event.type === "checkout.session.expired" || event.type === "payment_intent.payment_failed") {
    await sb.from("order_payment_attempts").update({
      status: event.type.includes("expired") ? "cancelled" : "failed",
      raw_payload: event as unknown as Record<string, unknown>,
    }).eq("id", attemptId);
  }

  return new Response("ok", { status: 200 });
});
