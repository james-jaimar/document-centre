# Payments rollout runbook (PayFast & Stripe)

How online payments are wired across the platform, and the operator
checklist for turning them on for any new tenant or branch.

## 3-layer model

| Layer | Who controls it | What it stores | Tables |
| --- | --- | --- | --- |
| **Platform** | Platform admin | The codebase, CSP, handoff page, edge functions. Nothing tenant-specific. | — |
| **Tenant** | Tenant owner/admin | Which providers (PayFast / Stripe) are *available* to this tenant's network. Optional tenant-wide credentials and display label. | `tenant_payment_gateways` |
| **Branch** | Branch manager (or tenant admin) | The *actual* merchant credentials (`merchant_id`, `merchant_key`, `passphrase` for PayFast; `secret_key`, `publishable_key`, `webhook_secret` for Stripe). Mode (sandbox/live). Funds settle to this branch's own merchant account. | `branch_payment_gateways` |

Credentials are stored in Supabase Vault — only the `credentials_secret_id` lives in these tables. Edge functions read the secret server-side; the browser never sees raw keys.

Every payment attempt is stamped with `tenant_id` + `branch_id` on `order_payment_attempts`. The PayFast ITN handler cross-checks the returned `merchant_id` against the branch's stored credentials before marking anything paid — that's the ringfence.

## Per-tenant rollout checklist

For each new tenant you want to take online payments:

1. **Tenant admin → Settings → Payments** → toggle PayFast (or Stripe) **Enabled**. Optionally set a display label (shown at checkout, e.g. "PayFast — secure card & EFT").
2. **Branch payment readiness card** on the same page shows every active branch with a status pill per enabled provider. Anything yellow = not yet ready.
3. For each branch, click **Manage** → **Branch Settings → Payments**:
   - PayFast: paste `merchant_id`, `merchant_key`, **passphrase** (must match the PayFast dashboard exactly — see warning pill if missing). Set mode to **Live** when production-ready.
   - Stripe: paste `sk_...`, `pk_...`, `whsec_...`. Set the webhook URL shown in the card on the Stripe dashboard.
4. Confirm the branch card shows the green **"Live — accepting payments"** pill.
5. End-to-end test: place a real low-value order from that branch's storefront, click Pay Online, confirm hand-off lands on `https://www.payfast.co.za/eng/process` (or Stripe Checkout), complete the payment, confirm the order moves to **Paid** via ITN/webhook.

## Sandbox testing

- Set the branch's mode to **Sandbox** and paste PayFast sandbox merchant credentials (10000100 / 46f0cd694581a or your own sandbox account).
- The PayFast handoff posts to `https://sandbox.payfast.co.za/eng/process` automatically based on mode.
- Sandbox transactions don't move real money but still trigger the ITN — useful to verify the full loop including `paid` status.

## Ringfencing — why cross-tenant payments are impossible

- `payments-create-session` resolves the provider via `resolveGatewaysForOrder(orderId)`, which only reads `tenant_payment_gateways` for the order's tenant and `branch_payment_gateways` for the order's branch. There's no global fallback.
- The signed PayFast form includes `custom_str1 = tenant_id`, `custom_str2 = branch_id`, `m_payment_id = attempt_id`.
- `payfast-itn` validates the signature, then re-reads the attempt and **rejects** the callback if the returned `merchant_id` doesn't match the credentials stored against that branch.
- Even if a malicious actor forged a request with another tenant's `m_payment_id`, the signature check (using *that* branch's passphrase) would fail.

## Common failures and what they mean

| Symptom | Cause | Fix |
| --- | --- | --- |
| Customer sees only EFT, no "Pay Online" button | Tenant gateway disabled, or branch has no credentials | Enable provider on tenant + add credentials on branch |
| `Generated signature does not match submitted signature` (400 from PayFast) | Passphrase set in PayFast dashboard but missing/different in branch settings | Re-enter passphrase exactly as in PayFast → Settings → Integration |
| `Payment is temporarily unavailable` toast | `merchant_id` or `merchant_key` missing on the branch | Re-save branch credentials |
| Customer reaches PayFast but order stays Unpaid after success | ITN URL not reachable, or ITN merchant_id mismatch | Check `payfast-itn` logs; confirm ITN URL matches the one shown in the branch card |
| `/pay/payfast` 404 after deploy | Stale build without SPA fallback | `vite.config.ts` `spaDeepLinkFallback` plugin must be present; re-deploy |
| CSP `form-action` error in console | `customHttp.yml` re-introduced a `form-action` directive | Leave `form-action` unset — PayFast's redirect chain spans hosts that can't be allow-listed |

## What lives where in the code

- `customHttp.yml` — Amplify response headers (CSP). `form-action` intentionally omitted.
- `vite.config.ts` — `spaDeepLinkFallback` plugin writes `dist/pay/payfast/index.html` so S3 deep-links resolve.
- `src/pages/PayfastHandoff.tsx` — Same-origin handoff page; renders a real `<form>` and auto-submits.
- `src/lib/payments/redirectToHostedPayment.ts` — Stashes signed payload in `sessionStorage`, navigates to `/pay/payfast` (PayFast) or directly to Stripe Checkout URL.
- `supabase/functions/_shared/payments.ts` — `resolveGatewaysForOrder` (tenant → branch credential resolution).
- `supabase/functions/_shared/payfast.ts` — Signing helpers, sandbox/live URL selection.
- `supabase/functions/payments-create-session` — Builds the signed PayFast form / Stripe session; enforces branch subscription gate.
- `supabase/functions/payfast-itn` — Validates signature + `/eng/query/validate` handshake + merchant_id ringfence; marks attempt paid.
- `supabase/functions/payments-get-credentials-summary` — Returns masked metadata for the admin UI (never raw secrets).
- `src/components/payments/PaymentGatewaysCard.tsx` — Tenant + branch credentials UI with readiness pills.
- `src/components/payments/BranchPaymentReadinessCard.tsx` — Tenant-level roll-up of branch readiness.
