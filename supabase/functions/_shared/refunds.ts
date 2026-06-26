// Auto-refund dispatcher shared by `order-engine` (auto-trigger on
// refund_pending creation) and `payments-refund` (UI retry button).
//
// Provider rules:
//   - We only refund through the SAME provider that took the original
//     successful payment, and using the SAME tenant/branch credentials
//     that received it. No cross-tenant routing.
//   - On synchronous success we mark the adjustment refunded immediately
//     and insert a negative payments row.
//   - Stripe refunds can settle async; the matching stripe webhook
//     flips `refund_initiated` → `refunded` once the provider confirms.
//   - PayFast ITN fires on REFUND status; same flip there.

import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { adminClient, readSecret } from "./payments.ts";
import { md5, pfEncode } from "./payfast.ts";

type Admin = ReturnType<typeof adminClient>;

export interface AutoRefundInput {
  adjustment_id: string;
  /** Optional override; defaults to abs(adjustment.amount). */
  amount?: number;
  /** Actor profile id (admin/customer) for audit. Null = system. */
  actor_id?: string | null;
  reason?: string;
}

export interface AutoRefundResult {
  ok: boolean;
  provider?: "stripe" | "payfast" | null;
  /** Provider refund id when available. */
  provider_refund_id?: string | null;
  /** "synchronous_success" | "async_initiated" | "no_online_payment" | "manual_only" */
  outcome:
    | "synchronous_success"
    | "async_initiated"
    | "no_online_payment"
    | "manual_only"
    | "error";
  error?: string;
}

/** Pick the most recent successful provider payment we can refund against. */
async function pickRefundablePayment(admin: Admin, orderId: string) {
  const { data } = await admin
    .from("payments")
    .select("id, provider, amount, currency, provider_transaction_id, provider_payment_intent_id, raw_payload, metadata, status, paid_at, created_at")
    .eq("order_id", orderId)
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (!data) return null;
  // Sum prior refunds on this order to clamp partial refunds.
  const prior = data
    .filter((p: any) => p.status === "refunded" || p.status === "refund_initiated")
    .reduce((s: number, p: any) => s + Math.abs(Number(p.amount || 0)), 0);
  const charge = data.find(
    (p: any) =>
      (p.status === "paid" || p.status === "refunded" || p.status === "refund_initiated") &&
      (p.provider === "stripe" || p.provider === "payfast") &&
      Number(p.amount) > 0,
  );
  if (!charge) return null;
  return { charge, refundedSoFar: prior };
}

/** Resolve the credentials row that took the original payment. */
async function resolveCreds(admin: Admin, order: any, provider: "stripe" | "payfast") {
  let secretId: string | null = null;
  let mode: "test" | "live" = "live";
  if (order.branch_id) {
    const { data } = await admin
      .from("branch_payment_gateways")
      .select("credentials_secret_id, mode")
      .eq("branch_id", order.branch_id)
      .eq("provider", provider)
      .maybeSingle();
    if (data?.credentials_secret_id) {
      secretId = data.credentials_secret_id;
      mode = (data.mode as any) ?? "live";
    }
  }
  if (!secretId) {
    const { data } = await admin
      .from("tenant_payment_gateways")
      .select("credentials_secret_id, mode")
      .eq("tenant_id", order.tenant_id)
      .eq("provider", provider)
      .maybeSingle();
    if (data?.credentials_secret_id) {
      secretId = data.credentials_secret_id;
      mode = (data.mode as any) ?? "live";
    }
  }
  if (!secretId) return null;
  const creds = await readSecret(secretId);
  if (!creds) return null;
  return { creds, mode };
}

/** ============== Stripe ============== */
async function refundStripe(args: {
  admin: Admin;
  order: any;
  charge: any;
  amount: number;
  adjustmentId: string;
  creds: Record<string, string>;
}) {
  const stripe = new Stripe(args.creds.secret_key, { apiVersion: "2023-10-16" });
  const paymentIntent =
    args.charge.provider_payment_intent_id ||
    (args.charge.raw_payload as any)?.data?.object?.payment_intent ||
    (args.charge.metadata as any)?.payment_intent;
  if (!paymentIntent) {
    throw new Error("No Stripe payment_intent on original charge — cannot auto-refund");
  }
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntent,
      amount: Math.round(args.amount * 100),
      reason: "requested_by_customer",
      metadata: {
        order_id: args.order.id,
        adjustment_id: args.adjustmentId,
        tenant_id: args.order.tenant_id,
      },
    },
    { idempotencyKey: `refund-${args.adjustmentId}` },
  );
  return refund;
}

/** ============== PayFast ============== */
// PayFast refunds API (https://developers.payfast.co.za/docs#refunds):
//   POST https://api.payfast.co.za/refunds/{pf_payment_id}[?testing=true]
// Headers: merchant-id, version, timestamp, signature
// Signature: alphabetically sorted url-encoded params (headers + body) joined with &,
// passphrase appended, MD5.
async function refundPayfast(args: {
  charge: any;
  amount: number;
  adjustmentId: string;
  creds: Record<string, string>;
  mode: "test" | "live";
  orderNumber: string;
}) {
  const pfPaymentId =
    args.charge.provider_transaction_id ||
    (args.charge.raw_payload as any)?.pf_payment_id;
  if (!pfPaymentId) {
    throw new Error("No PayFast pf_payment_id on original charge — cannot auto-refund");
  }
  const merchantId = String(args.creds.merchant_id).trim();
  const passphrase = (args.creds.passphrase || "").trim();
  if (!merchantId) throw new Error("PayFast merchant_id missing");

  const timestamp = new Date().toISOString();
  const body: Record<string, string> = {
    amount: String(Math.round(args.amount * 100)),
    reason: `Refund for order ${args.orderNumber}`.slice(0, 255),
    "merchant-reference": `adj-${args.adjustmentId.slice(0, 30)}`,
  };
  const headerSigParts: Record<string, string> = {
    "merchant-id": merchantId,
    version: "v1",
    timestamp,
  };

  // Sign: ALL keys (header + body) sorted alphabetically, urlencoded values.
  const all: Record<string, string> = { ...headerSigParts, ...body };
  const sortedKeys = Object.keys(all).sort();
  const baseString =
    sortedKeys.map((k) => `${k}=${pfEncode(all[k])}`).join("&") +
    (passphrase ? `&passphrase=${pfEncode(passphrase)}` : "");
  const signature = md5(baseString);

  const url =
    args.mode === "test"
      ? `https://api.payfast.co.za/refunds/${encodeURIComponent(pfPaymentId)}?testing=true`
      : `https://api.payfast.co.za/refunds/${encodeURIComponent(pfPaymentId)}`;

  const formBody = new URLSearchParams(body).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "merchant-id": merchantId,
      version: "v1",
      timestamp,
      signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody,
  });
  const text = await res.text();
  let payload: any = null;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  if (!res.ok || payload?.status === "failed" || payload?.data?.response === false) {
    const msg =
      payload?.data?.message ||
      payload?.message ||
      `PayFast refund failed (${res.status})`;
    throw new Error(msg);
  }
  return { pf_payment_id: pfPaymentId, response: payload };
}

/** ============== Main entrypoint ============== */
export async function processAutoRefund(
  admin: Admin,
  input: AutoRefundInput,
): Promise<AutoRefundResult> {
  const { data: adj } = await admin
    .from("order_adjustments")
    .select("id, order_id, amount, description, status, metadata")
    .eq("id", input.adjustment_id)
    .maybeSingle();
  if (!adj) return { ok: false, outcome: "error", error: "Adjustment not found" };
  if ((adj as any).status !== "refund_pending") {
    return { ok: false, outcome: "error", error: `Adjustment status is ${(adj as any).status}` };
  }

  const amount = Math.abs(Number(input.amount ?? (adj as any).amount));
  if (!(amount > 0)) return { ok: false, outcome: "error", error: "Refund amount must be > 0" };

  const { data: order } = await admin
    .from("orders")
    .select("id, app_id, tenant_id, branch_id, currency, amount_paid, order_number")
    .eq("id", (adj as any).order_id)
    .single();
  if (!order) return { ok: false, outcome: "error", error: "Order not found" };

  const picked = await pickRefundablePayment(admin, (order as any).id);
  if (!picked) {
    // No online charge to refund — leave for manual workflow.
    return { ok: true, outcome: "no_online_payment", provider: null };
  }
  const { charge, refundedSoFar } = picked;
  const remaining = Math.max(Number(charge.amount) - refundedSoFar, 0);
  const refundAmt = Math.min(amount, remaining);
  if (!(refundAmt > 0)) {
    return { ok: true, outcome: "manual_only", provider: null };
  }
  const provider = charge.provider as "stripe" | "payfast";
  const credsBundle = await resolveCreds(admin, order, provider);
  if (!credsBundle) {
    return { ok: false, outcome: "error", provider, error: `No ${provider} credentials configured for this tenant/branch` };
  }

  try {
    let providerRefundId: string | null = null;
    let providerStatus: "succeeded" | "pending" = "pending";
    let rawProviderPayload: any = {};

    if (provider === "stripe") {
      const refund = await refundStripe({
        admin,
        order,
        charge,
        amount: refundAmt,
        adjustmentId: (adj as any).id,
        creds: credsBundle.creds,
      });
      providerRefundId = refund.id;
      providerStatus = refund.status === "succeeded" ? "succeeded" : "pending";
      rawProviderPayload = refund as unknown as Record<string, unknown>;
    } else {
      const res = await refundPayfast({
        charge,
        amount: refundAmt,
        adjustmentId: (adj as any).id,
        creds: credsBundle.creds,
        mode: credsBundle.mode,
        orderNumber: (order as any).order_number || (order as any).id.slice(0, 8),
      });
      providerRefundId = `${res.pf_payment_id}-refund-${Date.now()}`;
      providerStatus = "pending"; // PayFast confirms async via ITN
      rawProviderPayload = res.response;
    }

    // Insert a payments row tracking the refund.
    const settledNow = providerStatus === "succeeded";
    await admin.from("payments").insert({
      order_id: (order as any).id,
      app_id: (order as any).app_id,
      tenant_id: (order as any).tenant_id,
      provider,
      provider_transaction_id: providerRefundId,
      provider_refund_id: providerRefundId,
      payment_reference: `Auto-refund for order ${(order as any).order_number || (order as any).id.slice(0, 8)}`,
      status: settledNow ? "refunded" : "refund_initiated",
      amount: -refundAmt,
      currency: (order as any).currency || charge.currency || "ZAR",
      paid_at: settledNow ? new Date().toISOString() : null,
      raw_payload: rawProviderPayload,
      metadata: {
        adjustment_id: (adj as any).id,
        source: "auto_refund",
        actor_id: input.actor_id ?? null,
        reason: input.reason ?? null,
      },
    });

    // Update adjustment: refunded if synchronous success, otherwise stay
    // refund_pending with metadata showing the refund is in flight.
    if (settledNow) {
      await admin
        .from("order_adjustments")
        .update({
          status: "refunded",
          metadata: {
            ...((adj as any).metadata ?? {}),
            auto_refunded: true,
            auto_refunded_at: new Date().toISOString(),
            provider,
            provider_refund_id: providerRefundId,
          },
        })
        .eq("id", (adj as any).id);

      // Decrement amount_paid and re-sync.
      const newPaid = Math.max(Number((order as any).amount_paid || 0) - refundAmt, 0);
      await admin.from("orders").update({ amount_paid: newPaid }).eq("id", (order as any).id);
    } else {
      await admin
        .from("order_adjustments")
        .update({
          metadata: {
            ...((adj as any).metadata ?? {}),
            auto_refund_initiated_at: new Date().toISOString(),
            provider,
            provider_refund_id: providerRefundId,
            last_attempt_error: null,
          },
        })
        .eq("id", (adj as any).id);
    }

    // Timeline.
    await admin.from("timeline_events").insert({
      app_id: (order as any).app_id,
      tenant_id: (order as any).tenant_id,
      branch_id: (order as any).branch_id,
      order_id: (order as any).id,
      event_type: settledNow ? "refund_completed" : "refund_initiated",
      visibility: "both",
      actor_type: input.actor_id ? "admin" : "system",
      actor_profile_id: input.actor_id ?? null,
      description: settledNow
        ? `Auto-refund of ${refundAmt.toFixed(2)} ${(order as any).currency} succeeded via ${provider}`
        : `Auto-refund of ${refundAmt.toFixed(2)} ${(order as any).currency} initiated via ${provider} (awaiting provider confirmation)`,
      metadata: {
        adjustment_id: (adj as any).id,
        provider,
        provider_refund_id: providerRefundId,
        amount: refundAmt,
      },
    });

    // Audit log
    await admin.from("ops_audit_log").insert({
      app_id: (order as any).app_id,
      tenant_id: (order as any).tenant_id,
      action: "payment_refund",
      entity_type: "order",
      entity_id: (order as any).id,
      actor_profile_id: input.actor_id ?? null,
      payload: {
        provider, amount: refundAmt, adjustment_id: (adj as any).id,
        provider_refund_id: providerRefundId, status: providerStatus,
      },
    }).then(() => {}, () => {}); // best-effort

    return {
      ok: true,
      outcome: settledNow ? "synchronous_success" : "async_initiated",
      provider,
      provider_refund_id: providerRefundId,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("processAutoRefund failed", { adjustmentId: (adj as any).id, msg });

    // Record failure on the adjustment for the UI; do NOT change status.
    await admin
      .from("order_adjustments")
      .update({
        metadata: {
          ...((adj as any).metadata ?? {}),
          last_attempt_error: msg,
          last_attempt_at: new Date().toISOString(),
          last_attempt_provider: provider,
        },
      })
      .eq("id", (adj as any).id);

    await admin.from("timeline_events").insert({
      app_id: (order as any).app_id,
      tenant_id: (order as any).tenant_id,
      branch_id: (order as any).branch_id,
      order_id: (order as any).id,
      event_type: "refund_failed",
      visibility: "internal",
      actor_type: input.actor_id ? "admin" : "system",
      actor_profile_id: input.actor_id ?? null,
      description: `Auto-refund via ${provider} failed: ${msg.slice(0, 200)}`,
      metadata: { adjustment_id: (adj as any).id, provider, error: msg },
    });

    return { ok: false, outcome: "error", provider, error: msg };
  }
}
