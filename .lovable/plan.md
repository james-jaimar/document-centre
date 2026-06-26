# Auto-refunds for Stripe & PayFast

Today every refund (cancel, qty reduction, fulfillment downgrade) creates an `order_adjustments` row with `status='refund_pending'` and the branch has to click **Mark refunded** after pushing money back manually. We'll wire each provider's refund API so online-paid orders refund automatically, and fall back to the manual flow only when the provider call can't be made.

## 1. Capture provider refund handles on success

We can only refund what we can identify. Audit the success paths and make sure each `payments` row carries the IDs the provider's refund API needs:

- **Stripe** (`stripe-order-webhook` on `checkout.session.completed`): store `payment_intent` (and `charge` id if available) on the `payments` row and in `orders.metadata.stripe.payment_intent_id`.
- **PayFast** (`payfast-itn`): persist `pf_payment_id` (PayFast's own id) plus the `m_payment_id` we sent, on the `payments` row and `orders.metadata.payfast`.

Backfill: a short SQL pass to populate these from existing webhook payloads where present, so already-paid test orders are refundable.

## 2. New shared refund dispatcher (edge fn `payments-refund`)

Single entrypoint called by `order-engine` whenever a `refund_pending` adjustment is created, and also callable from the **Mark refunded** button (which becomes **Refund now** for online-paid orders).

Inputs: `adjustment_id` (or `order_id` + `amount` + `reason`).
Behaviour:
1. Loads the order, its successful `payments` rows, and tenant/branch payment-gateway credentials (same `resolveGatewaysForOrder` helper as `payments-create-session`, so tenant ringfencing is preserved).
2. Picks the original paying provider from the most recent succeeded payment.
3. Calls the provider:
   - **Stripe**: `stripe.refunds.create({ payment_intent, amount: zar*100, reason: 'requested_by_customer', metadata: { order_id, adjustment_id }})`. Idempotency-Key = `adjustment_id`.
   - **PayFast**: `POST https://api.payfast.co.za/refunds/{pf_payment_id}` (sandbox host in sandbox mode), body `amount` (cents) + `reason` + `merchant-reference`, signed exactly like our existing `pfEncode`/`payfastSignFormPairs` helper using the tenant's passphrase. Headers: `merchant-id`, `version=v1`, `timestamp`, `signature`.
4. On success: insert a negative `payments` row (provider = stripe/payfast, `status='refunded'`, amount = `-refundAmt`, `provider_refund_id` in metadata), update the adjustment to `status='refunded'` with `metadata.auto_refunded=true`, decrement `orders.amount_paid`, re-sync totals, log timeline `refund_completed`.
5. On failure: leave the adjustment as `refund_pending`, write a timeline entry `refund_failed` with the provider error, surface the error to the UI so the branch can retry or fall back to manual.

Partial refunds and multi-payment orders are supported by passing explicit `amount` and walking payments newest-first until the refund amount is satisfied.

## 3. Async confirmation via webhooks

Stripe refunds can settle asynchronously (esp. bank rails). Extend `stripe-webhook` / `stripe-order-webhook` to handle `charge.refunded` and `refund.updated` — match by `metadata.adjustment_id` and only mark the adjustment `refunded` once the provider reports `succeeded`. PayFast ITN already fires on refund events; extend `payfast-itn` to detect `payment_status='REFUND'` and reconcile the same way. The initial API call optimistically marks `refund_initiated`; the webhook flips it to `refunded`.

## 4. order-engine integration

In `cancelOrder`, `customerChangeQuantities`, `customerChangeFulfillment` (the three places that call `createRefundPendingAdjustment`):
- After inserting the adjustment, if the order's last successful payment is Stripe or PayFast, invoke `payments-refund` server-to-server.
- Keep the existing `refund_pending` return flag so the UI still warns the customer, but flip it to `refund_initiated` when the provider call succeeds synchronously.

EFT / manual payments keep today's flow unchanged.

## 5. UI changes

- `OrderPricingTab.tsx`: relabel button per state — **Refund automatically** (online-paid, pending), **Retry refund** (after a failed auto attempt, shows provider error), **Mark refunded** (manual/EFT only). Show "Auto-refunded via Stripe/PayFast on {date} — ref {provider_refund_id}" when complete.
- `ManageOrderPanel` / `CancelOrderDialog`: copy update — "Your card will be refunded automatically" for online-paid orders, existing manual copy for EFT.
- Branch admin gets a toast + timeline entry on auto-refund success/failure.

## 6. Safety & ringfencing

- Refund creds come from the same `branch_payment_gateways` / `tenant_payment_gateways` row that took the payment — never cross-tenant.
- Stripe Idempotency-Key + adjustment uniqueness prevents double refunds on retries.
- Refund amount is clamped to `min(adjustment.amount, sum(successful payments) - sum(prior refunds))`.
- All provider responses logged to `ops_audit_log` (action `payment_refund`).

## 7. Rollout

1. Migration: add `provider_refund_id`, `provider_payment_intent_id` columns to `payments` (nullable) + backfill from existing metadata; add `status` value `refund_initiated` handling.
2. Ship `payments-refund` edge fn + webhook extensions.
3. Wire order-engine to invoke it.
4. Update UI labels and dialogs.
5. Manual test matrix: Stripe full cancel, Stripe partial qty drop, PayFast full cancel, PayFast fulfillment downgrade, EFT (should stay manual), failed-provider retry path.

## Technical notes

- PayFast refund API requires the **live** merchant to enable refunds in their dashboard; we'll surface a clear error if the call returns "Refunds not enabled" and fall back to manual with guidance.
- Sandbox PayFast supports refunds against sandbox payments only; tests will use the sandbox creds already saved on Test Branch.
- Stripe refunds support partial amounts natively; we pass `amount` in minor units of the order currency.
- No schema change to `order_adjustments` — `status='refund_initiated'` is a new value handled in code; existing `refund_pending` / `refunded` semantics preserved.
