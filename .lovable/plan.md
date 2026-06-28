# Fix: "Change fulfillment" → Edge Function returns non-2xx

## Root cause analysis

The user clicked **Confirm change** in `ChangeFulfillmentDialog` and saw
`Update failed — Edge Function returned a non-2xx status code`. That generic
text is the default `FunctionsHttpError.message` from `supabase.functions.invoke`,
which **swallows the response body**. We never see *which* step failed.

Looking at `supabase/functions/order-engine/index.ts → adminChangeFulfillment`,
several call sites can return a non-2xx without our UI surfacing the reason:

1. `fetchOrderForAdmin(..., { adminOnly: true })` returns **403** if the staff
   user is not `owner`/`admin` at the order's tenant/branch. Branch managers
   (the role many of our PostNet branch users actually hold) are blocked —
   even though Step 1/Step 2 of the dialog still render because we only call
   the function on confirm.
2. `triggerEmail("payment_request", { force: true })` runs `send-order-email`
   with the **service-role JWT**. If that function rejects service tokens or
   the template is missing for this tenant, the whole request errors out — even
   though the email is meant to be best-effort.
3. `triggerInvoice("invoice")` similarly bubbles errors when the PDF render
   fails (missing logo, unresolved address, etc.).
4. The `orders.metadata` update could be rejected by RLS if the service-role
   client is missing the `metadata` JSONB column (unlikely, but easy to log).

We have no way to confirm which of these fires because the client throws the
generic message and the edge logs only show "booted".

## Plan (build-mode edits)

### 1. Make the client surface the real error  
`src/lib/orders/mutations.ts → invokeOrderEngine`
- After `supabase.functions.invoke` returns an error, read `error.context`
  (the underlying `Response`) and parse the JSON body so toasts show messages
  like `Only owners or admins of this branch/tenant may perform this action`
  or `Failed to update fulfillment: …`.

### 2. Make `adminChangeFulfillment` resilient & observable  
`supabase/functions/order-engine/index.ts → adminChangeFulfillment`
- Allow `branch_manager` to change fulfillment for orders inside their own
  branch (relax `assertOrderStaffAccess` for this specific action — keeps
  parity with who can already record payments, edit pricing, etc.).
- Wrap **every** side-effect step (`logTimeline`, `triggerEmail`,
  `triggerInvoice`, `createRefundPendingAdjustment`) in its own `try/catch`
  that logs but never aborts the response.
- Add a top-level `try/catch` returning a JSON `{ error }` with the exact
  failure point (`step: "update_order" | "address_upsert" | "totals" | …`).
- `console.log` the payload + computed totals at the top so future failures
  show in `supabase functions logs order-engine`.

### 3. Confirm with the user
Once both edits are deployed, ask the user to retry; the toast will now read
the real reason and we can fix the underlying cause in a follow-up.

## Files to edit
- `src/lib/orders/mutations.ts` (invokeOrderEngine wrapper)
- `supabase/functions/order-engine/index.ts` (`adminChangeFulfillment` +
  optional role widening)

No DB migrations required.
