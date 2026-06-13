## Problem

When a customer places an order, the order confirmation email never sends. Confirmed via edge logs: the order-engine's call to `send-order-email` for order INV-00090 returned **403 Forbidden**.

## Root cause

`triggerEmail` and `triggerInvoice` in `supabase/functions/order-engine/index.ts` forward the original caller's `Authorization` header. For customer-initiated flows (`createOrderWithJobs` at checkout), that's the customer's user token. `send-order-email`'s auth guard only accepts:
- service-role bearer, OR
- a tenant staff role (`owner|admin|sales|production|accounts|branch_manager|store_operator`).

Customers fail both checks → 403, no email queued. The tenant notification toggles (Order Confirmation / Payment Received / etc.) are never even reached.

Manual sends from the admin UI work because they're triggered by staff users whose token passes the guard. That's why pro-forma and payment-request emails from the admin work, but the auto-triggers don't.

`triggerInvoice` (proforma generation) is also rejected the same way, so even if the email did send it wouldn't have the PDF attached.

## Fix

Server-to-server side-effects from `order-engine` (and any other backend triggers) should authenticate as the service role, not as the customer.

### 1. `supabase/functions/order-engine/index.ts`

Change `triggerEmail` and `triggerInvoice` to drop the `authHeader` parameter and send `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` instead.

```ts
async function triggerEmail(order_id: string, event_key: string, extra: Record<string, unknown> = {}) {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${url}/functions/v1/send-order-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ order_id, event_key, ...extra }),
    });
  } catch (e) { console.error("triggerEmail failed:", e); }
}
```

Apply the same change to `triggerInvoice`. Update all call sites (createOrderWithJobs, recordPaymentEvent, refundPayment, updateOrderStatus, updateJobStatus, cancelOrder, reorderOrder, sendMessage, recomputeAndNotify) to drop the `authHeader` argument.

### 2. Verify the existing service-role bearer check in `send-order-email/index.ts`

Line 271: `const isServiceRole = bearer && bearer === serviceKey;` — this already handles service-role calls correctly. No change needed there.

### 3. Re-test

- Place a fresh test order on PostNet.
- Confirm `email_outbox` gets a row with `metadata.event_key = 'order_received'` within seconds.
- Confirm `order_invoices` gets a `proforma` row and that the email has the PDF attached.
- Confirm a row exists in `timeline_events` for the order.
- Repeat for `recordPaymentEvent` (mark order paid in admin) → `payment_received` email + receipt PDF.

### 4. Deploy

Deploy `order-engine` only. `send-order-email` is unchanged.

## Out of scope

- The tenant notification toggle UI is working correctly; no changes there.
- The Stripe webhook path already uses service-role to invoke order-engine, so its downstream triggers will start working as soon as this fix lands.