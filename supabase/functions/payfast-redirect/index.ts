// Server-rendered PayFast handoff. The customer's browser GETs this URL
// (which lives on *.supabase.co, NOT the app domain) and we respond with a
// tiny HTML page that auto-submits a hidden form to PayFast.
//
// Why: posting the form from the React app itself is fragile — CSP
// `form-action`, browser extensions, popup-blockers, autofill, and timing
// races against page-unload can all break it silently. By moving the POST
// origin to Supabase we get a clean, deterministic redirect that the app's
// CSP never touches, and we surface real errors as a normal HTTP response.
//
// Security:
//   - The query string carries a short-lived HMAC `token` minted by
//     `payments-create-session`. Without a valid token this endpoint refuses.
//   - We re-resolve credentials server-side from the attempt record, so the
//     merchant key/passphrase never travels back through the browser.
//   - We re-generate the signature with the documented field order so the
//     redirect page can't be tampered with via URL parameters.

import {
  payfastProcessUrl,
  payfastSignFormPairs,
  verifyRedirectToken,
  type PayfastMode,
} from "../_shared/payfast.ts";
import { adminClient, readSecret } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return htmlError("Missing token", 400);

  const v = await verifyRedirectToken(token);
  if (!v.ok) return htmlError(`Invalid or expired payment link (${v.reason})`, 400);

  const attemptId = v.attemptId;
  const sb = adminClient();

  const { data: attempt, error: attemptErr } = await sb
    .from("order_payment_attempts")
    .select("id, order_id, tenant_id, branch_id, amount, currency, provider")
    .eq("id", attemptId)
    .maybeSingle();
  if (attemptErr || !attempt) return htmlError("Payment attempt not found", 404);
  if (attempt.provider !== "payfast") return htmlError("Wrong provider", 400);

  const { data: order } = await sb
    .from("orders")
    .select("id, order_number, currency, return_url_path, branch_id, tenant_id")
    .eq("id", attempt.order_id)
    .maybeSingle();
  if (!order) return htmlError("Order not found", 404);

  // Re-resolve PayFast credentials (branch override -> tenant) using the
  // same precedence as resolveGatewaysForOrder + payfast-itn.
  let secretId: string | null = null;
  let mode: PayfastMode = "test";
  if (attempt.branch_id) {
    const { data: bpg } = await sb
      .from("branch_payment_gateways")
      .select("credentials_secret_id, mode")
      .eq("branch_id", attempt.branch_id)
      .eq("provider", "payfast")
      .maybeSingle();
    if (bpg?.credentials_secret_id) {
      secretId = bpg.credentials_secret_id;
      mode = (bpg.mode as PayfastMode) ?? "test";
    }
  }
  if (!secretId) {
    const { data: tpg } = await sb
      .from("tenant_payment_gateways")
      .select("credentials_secret_id, mode")
      .eq("tenant_id", attempt.tenant_id)
      .eq("provider", "payfast")
      .maybeSingle();
    if (tpg?.credentials_secret_id) {
      secretId = tpg.credentials_secret_id;
      mode = (tpg.mode as PayfastMode) ?? "test";
    }
  }
  if (!secretId) return htmlError("PayFast credentials not configured", 400);

  const creds = await readSecret(secretId);
  if (!creds?.merchant_id || !creds?.merchant_key) {
    return htmlError("PayFast credentials incomplete", 500);
  }

  // Read the original return/cancel URLs stashed on the attempt's raw_payload
  // when the session was created (we set them there for exactly this purpose).
  const { data: attemptRow } = await sb
    .from("order_payment_attempts")
    .select("raw_payload")
    .eq("id", attemptId)
    .maybeSingle();
  const handoff = (attemptRow?.raw_payload as any)?.handoff ?? {};
  const returnUrl = handoff.return_url as string | undefined;
  const cancelUrl = handoff.cancel_url as string | undefined;
  if (!returnUrl || !cancelUrl) {
    return htmlError("Payment handoff details missing", 500);
  }

  const projectUrl = Deno.env.get("SUPABASE_URL")!;
  const itnUrl = `${projectUrl}/functions/v1/payfast-itn`;
  const amount = Number(attempt.amount);

  const pairs: Array<[string, string]> = [
    ["merchant_id", String(creds.merchant_id).trim()],
    ["merchant_key", String(creds.merchant_key).trim()],
    ["return_url", returnUrl],
    ["cancel_url", cancelUrl],
    ["notify_url", itnUrl],
    ["m_payment_id", attempt.id],
    ["amount", amount.toFixed(2)],
    ["item_name", `Order ${order.order_number || order.id.slice(0, 8)}`],
  ];
  const passphrase = (creds.passphrase || "").trim();
  const { signature } = payfastSignFormPairs(pairs, passphrase);

  const action = payfastProcessUrl(mode);
  const inputs = [...pairs, ["signature", signature]]
    .map(([k, v]) => `<input type="hidden" name="${escapeAttr(k)}" value="${escapeAttr(v)}">`)
    .join("\n      ");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Redirecting to PayFast…</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1e293b;padding:24px 28px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.3);text-align:center;max-width:360px}
    .spinner{width:28px;height:28px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:s 1s linear infinite;margin:0 auto 14px}
    @keyframes s{to{transform:rotate(360deg)}}
    button{margin-top:14px;background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer}
    .muted{color:#94a3b8;font-size:13px;margin-top:8px}
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <div>Redirecting you securely to PayFast…</div>
    <form id="pf" method="POST" action="${escapeAttr(action)}" style="display:none">
      ${inputs}
    </form>
    <noscript>
      <p class="muted">JavaScript is disabled. Tap the button below to continue.</p>
      <button type="submit" form="pf">Continue to PayFast</button>
    </noscript>
    <p class="muted">If this page does not redirect within a few seconds, <button type="submit" form="pf">click here</button>.</p>
  </div>
  <script>document.getElementById('pf').submit();</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Single-purpose page — keep it tightly locked down, including
      // form-action which now ONLY needs to allow PayFast.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action https://www.payfast.co.za https://sandbox.payfast.co.za https://payfast.co.za https://*.payfast.co.za; base-uri 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
});

function escapeAttr(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlError(msg: string, status = 400): Response {
  const safe = escapeAttr(msg);
  const body = `<!doctype html><meta charset="utf-8"><title>Payment error</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}.c{background:#1e293b;padding:24px 28px;border-radius:12px;text-align:center;max-width:380px}h1{font-size:18px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;margin:0}</style>
<div class="c"><h1>We couldn't start your payment</h1><p>${safe}</p><p style="margin-top:12px">Please return to the store and try again, or pay by EFT.</p></div>`;
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
