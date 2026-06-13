## Status: already complete

The previous fix changed the **helpers** `triggerEmail` and `triggerInvoice` in `supabase/functions/order-engine/index.ts` so they always send `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, regardless of who originally called the engine. Because every order-engine side-effect funnels through these two helpers, all notifications are fixed in one place.

### Coverage check vs. the Notifications tab

| Toggle | event_key | Trigger site in order-engine |
|---|---|---|
| Order Confirmation | `order_received` | `createOrderWithJobs`, `reorderOrder` |
| Payment Received | `payment_received` | `recordPaymentEvent` (manual + Stripe webhook) |
| Proof Ready | `proof_ready` | proof creation |
| Order Dispatched | `dispatched` | `updateOrderStatus` → `dispatched` |
| Order Completed | `completed` | `updateOrderStatus` → `completed`, `updateJobStatus` rollup |

Also covered (no toggle, always-on or contextual): `ready_for_collection`, `in_production`, `order_cancelled`, `refunded`, `new_message`, `payment_request` (the recompute path was migrated off its inline `fetch` to use `triggerEmail` too).

### Out of scope — intentionally unchanged

- `src/lib/orders/mutations.ts → sendInvoiceEmail` and `requestPayment` are **admin-initiated** from the staff UI. They run with a staff bearer that already satisfies `send-order-email`'s auth guard. No change needed.
- `useQuotes.ts → send-quote-email` is admin-only.
- `send-order-email`'s inline fallback that auto-generates a proforma when `payment_request` has none: when called from `triggerEmail`, the incoming `Authorization` is now the service-role key, so the forwarded call also has service-role privileges. Works.

### Recommended verification (no code changes)

1. Place a fresh test order on PostNet → confirm row in `email_outbox` with `metadata.event_key = 'order_received'` and a proforma PDF attached.
2. Admin marks paid → confirm `payment_received` row + receipt PDF.
3. Admin sets status to Dispatched (with tracking) → confirm `dispatched` row.
4. Admin sets status to Completed → confirm `completed` row.

If any of these don't appear, check `order-engine` logs for the new "triggerEmail … failed: <status>" message I added, which will tell us the next layer to look at.

No further edits required.