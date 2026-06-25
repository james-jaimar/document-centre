## Root cause

`payfast-redirect` queries `orders.return_url_path`, but that column does not exist on `public.orders`. PostgREST returns an error, our code ignores it (only destructures `data`), so `order` is `null` and we render the `"Order not found"` HTML page with a 404 status. The attempt itself was created correctly (verified in DB) and the return/cancel URLs are already stashed on `order_payment_attempts.raw_payload.handoff` — we don't actually need anything from `orders` except `order_number` for the PayFast `item_name`.

The "Blocked script execution / sandboxed iframe" message is a separate, harmless artifact of the Lovable preview iframe — on the real `postnetprintcentre.com` site this is a top-level navigation and scripts run fine. No fix needed there.

## Fix

1. **`supabase/functions/payfast-redirect/index.ts`**
   - Change the `orders` select from `"id, order_number, currency, return_url_path, branch_id, tenant_id"` to `"id, order_number"` (everything else is already on the attempt row).
   - While we're in there, surface the underlying error in `console.error` when the order lookup fails so future schema mismatches don't silently turn into "Order not found".
   - Collapse the two `order_payment_attempts` selects into one — we already read the attempt up top, and `raw_payload` can be added to that first select instead of a second round-trip.

2. **Verify after deploy**
   - Re-trigger a PayFast checkout from PostNet Test Branch.
   - Confirm `payfast-redirect` logs no error and the browser POSTs to `https://www.payfast.co.za/eng/process`.
   - If PayFast still returns "signature does not match", we move to the next layer (signature/passphrase audit) — but that's blocked until this 404 is gone.

No DB changes, no other files touched.
