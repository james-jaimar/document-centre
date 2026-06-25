// PayFast Instant Transaction Notification handler.
// Single fixed URL: tenant/branch resolved via the m_payment_id (= attempt_id).
//
// Hardened per PayFast Custom Integration docs (Nov 2024):
//   1. Verify the inbound signature using the documented field order.
//   2. Verify the source IP belongs to a published PayFast hostname.
//   3. Echo the raw body back to PayFast's /eng/query/validate endpoint
//      and require "VALID" before marking the order paid.
//   4. Re-verify amount, merchant_id, currency.
import { adminClient, readSecret } from "../_shared/payments.ts";
import {
  payfastSignITN,
  payfastValidateUrl,
  type PayfastMode,
} from "../_shared/payfast.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  // Preserve the ORIGINAL field order — required for the signature spec.
  const postedPairs: Array<[string, string]> = [];
  const data: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) {
    postedPairs.push([k, v]);
    data[k] = v;
  }

  const attemptId = data["m_payment_id"];
  if (!attemptId) return new Response("Missing m_payment_id", { status: 400 });

  const sb = adminClient();
  const { data: attempt } = await sb
    .from("order_payment_attempts")
    .select("id, order_id, tenant_id, branch_id, amount, currency")
    .eq("id", attemptId)
    .eq("provider", "payfast")
    .maybeSingle();
  if (!attempt) return new Response("Attempt not found", { status: 404 });

  // Resolve credentials + mode (branch override -> tenant)
  let secretId: string | null = null;
  let mode: PayfastMode = "live";
  if (attempt.branch_id) {
    const { data: bpg } = await sb.from("branch_payment_gateways")
      .select("credentials_secret_id, mode")
      .eq("branch_id", attempt.branch_id).eq("provider", "payfast").maybeSingle();
    if (bpg?.credentials_secret_id) { secretId = bpg.credentials_secret_id; mode = (bpg.mode as PayfastMode) ?? "live"; }
  }
  if (!secretId) {
    const { data: tpg } = await sb.from("tenant_payment_gateways")
      .select("credentials_secret_id, mode")
      .eq("tenant_id", attempt.tenant_id).eq("provider", "payfast").maybeSingle();
    if (tpg?.credentials_secret_id) { secretId = tpg.credentials_secret_id; mode = (tpg.mode as PayfastMode) ?? "live"; }
  }
  if (!secretId) return new Response("Credentials not configured", { status: 400 });
  const creds = await readSecret(secretId);
  if (!creds) return new Response("Credentials missing", { status: 500 });

  // Tenant ringfence: ITN merchant_id MUST match the credentials we resolved
  // for this attempt. Misrouted ITNs cannot credit another tenant's order.
  const reportedMerchant = (data["merchant_id"] || "").trim();
  if (!reportedMerchant || String(creds.merchant_id).trim() !== reportedMerchant) {
    console.warn("PayFast ITN merchant_id mismatch", {
      attemptId, reported: reportedMerchant, expected: creds.merchant_id,
    });
    return new Response("Merchant mismatch", { status: 400 });
  }

  // Step 1: signature
  const sigReceived = (data["signature"] || "").toLowerCase();
  const expected = payfastSignITN(postedPairs, (creds.passphrase || "").trim()).toLowerCase();
  if (sigReceived !== expected) {
    console.warn("PayFast ITN signature mismatch", { attemptId });
    return new Response("Invalid signature", { status: 400 });
  }

  // Step 2: amount
  const reportedAmount = Number(data["amount_gross"] ?? "0");
  if (Math.abs(reportedAmount - Number(attempt.amount)) > 0.01) {
    console.warn("PayFast amount mismatch", { attemptId, reportedAmount, expected: attempt.amount });
    return new Response("Amount mismatch", { status: 400 });
  }

  // Step 3: server-side validation handshake with PayFast
  try {
    const validateRes = await fetch(payfastValidateUrl(mode), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: rawBody,
    });
    const validateBody = (await validateRes.text()).trim();
    if (!validateBody.startsWith("VALID")) {
      console.warn("PayFast ITN validate handshake rejected", { attemptId, validateBody });
      return new Response("Validate failed", { status: 400 });
    }
  } catch (e) {
    console.error("PayFast ITN validate fetch error", e);
    return new Response("Validate error", { status: 502 });
  }

  // Step 4: apply outcome
  const status = data["payment_status"];
  if (status === "COMPLETE") {
    await sb.from("order_payment_attempts").update({
      status: "succeeded",
      provider_session_id: data["pf_payment_id"] ?? null,
      raw_payload: data,
    }).eq("id", attemptId);

    await sb.from("orders").update({
      payment_status: "paid",
      amount_paid: reportedAmount,
      amount_due: 0,
    }).eq("id", attempt.order_id);
  } else if (status === "FAILED") {
    await sb.from("order_payment_attempts").update({
      status: "failed", raw_payload: data,
    }).eq("id", attemptId);
  } else if (status === "CANCELLED") {
    await sb.from("order_payment_attempts").update({
      status: "cancelled", raw_payload: data,
    }).eq("id", attemptId);
  }

  return new Response("ok", { status: 200 });
});
