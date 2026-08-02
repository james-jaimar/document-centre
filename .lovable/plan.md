## What happens today (verified)

At checkout, `handlePlaceOrder` (`src/pages/dashboard/Checkout.tsx:303`) runs `placeOrder` **before** any payment handoff. That mutation (`src/hooks/useCart.ts:382-831`) calls `order-engine → createOrderWithJobs`, which inserts the order with `admin_status: 'new_order'`, `customer_status: 'awaiting_payment'`, `submitted_at: now()` (`supabase/functions/order-engine/index.ts:230-260`), and the engine's side-effects then generate a **proforma invoice** and send the **order_received** email (`index.ts:2413-2429`). Immediately afterwards the mutation **deletes the cart order and all its items** (`useCart.ts:812-820`) — which is why the "Nothing to checkout / cart is empty" screen flashes before the PayFast redirect.

So the order is not literally "complete" (it is `unpaid`), but it *is* fully submitted: it lands in the branch's New Orders queue and count (`useNewOrdersCount.ts:25`), the customer gets a proforma + confirmation email, and the cart is gone — even if PayFast then fails or the customer abandons.

## Goal

For online payment (PayFast / Stripe), the order is created but **held** until the gateway confirms. Nothing is announced, nothing is emailed, and the cart stays intact so the customer can come back, retry, or switch to EFT.

## Plan

### 1. Held order state (order-engine)
- `createOrderWithJobs` accepts `hold_for_payment: true`. When set:
  - `admin_status: 'pending_payment'`, `customer_status: 'pending_payment'`, `payment_status: 'unpaid'`, `submitted_at: null`
  - metadata records `cart_order_id` and `held_at`
  - **skip** the proforma + `order_received` side effects entirely.
- New engine action `activateHeldOrder(order_id, reason: 'paid' | 'eft')`, idempotent:
  - flips to `admin_status: 'new_order'`, `customer_status: 'awaiting_payment'`, stamps `submitted_at`
  - fires the proforma + `order_received` email exactly once (guarded on `submitted_at` already being set)
  - deletes the linked cart order/items (the cleanup currently in `useCart.ts`).

### 2. Checkout flow
- EFT / pay-later: unchanged behaviour — place the order and activate immediately in the same call.
- PayFast / Stripe: place with `hold_for_payment`, keep the cart, then hand off. Guard the "Nothing to checkout" empty-state behind a `redirecting` flag so the flash disappears; show "Redirecting to PayFast…" instead.
- On the cancel/return-with-failure path, the cart is still there and the held order is reachable so they can retry or choose EFT.

### 3. Settlement paths activate the order
- `payfast-itn`: on `COMPLETE`, after marking paid, call `activateHeldOrder(..., 'paid')` before issuing the tax invoice.
- `stripe-webhook`: same on `checkout.session.completed`.
- Customer switching to EFT on a held order (checkout or order page) calls `activateHeldOrder(..., 'eft')`.
- ITN `FAILED` / `CANCELLED` leave the order held — no notification, cart untouched.

### 4. Keep held orders invisible everywhere
- Branch/admin order lists, the New Orders badge (`useNewOrdersCount`), and the customer's order history filter out `admin_status = 'pending_payment'`.
- The customer's confirmation page for a held order shows "Awaiting payment — complete payment or pay by EFT" with retry/EFT buttons, not a success screen.
- Reuse: if the same customer re-checks-out while a held order exists for the same cart, void the previous held order instead of stacking duplicates.

### 5. Expiry
- Held orders older than 24h are cancelled (`admin_status: 'cancelled'`, metadata `hold_expired`) by a sweep in the existing scheduled cleanup path. Carts are never touched by expiry.

## Technical notes
- No schema migration needed if `admin_status` / `customer_status` are text columns; will confirm and add an enum value via migration if they are enums.
- `activateHeldOrder` runs with the service-role client so webhooks (no user JWT) can call it; the customer-facing route goes through the normal authed `order-engine` invoke with an ownership check.
- Files touched: `supabase/functions/order-engine/index.ts`, `supabase/functions/payfast-itn/index.ts`, `supabase/functions/stripe-webhook/index.ts`, `src/hooks/useCart.ts`, `src/pages/dashboard/Checkout.tsx`, `src/pages/dashboard/OrderConfirmation.tsx`, `src/hooks/useNewOrdersCount.ts`, `src/hooks/useOrders.ts`.
