## What actually happened

The order was placed on **EFT** because the PayFast radio never rendered. Two issues combined:

1. **Race condition in the providers query.** The query that lists enabled online payment providers only waits for `tenantId` before firing — it does not wait for `activeBranch.id`. On the first render `activeBranch` is `undefined`, so the branch-creds lookup runs against an empty array. Tenant-level PayFast has **no credentials** (only the branch does), so when the tenant row arrives without branch creds the filter drops PayFast entirely. The query result is then cached and is not re-run when the branch resolves a tick later.

2. **Silent fallback to EFT.** `paymentMethod` defaults to `"offline"`, the Place Order button stays enabled regardless of whether the providers query has finished, and the button label only changes when an online provider is explicitly picked. So a customer who expects PayFast to be there can click Place Order and submit an EFT order without realising.

Confirmed in DB: Test Branch (`93f5ba02…`) has live PayFast creds; tenant has PayFast enabled but no creds. RLS and grants are correct. The just-placed order is `INV-00112` (R287.50, `confirmed / unpaid`).

## Fix

### 1. `src/pages/dashboard/Checkout.tsx` — providers query
- Add `activeBranch?.id` (when there are branches) to the `enabled` gate so the query waits for the branch to resolve.
- Track `isLoading` from the query and use it to (a) show a small "Loading payment options…" line under the Payment Method heading, and (b) disable the Place Order button until providers have loaded.

### 2. Checkout default + UX guard
- When the providers query returns at least one online provider, **auto-select the first online provider** (PayFast in this case) instead of leaving "offline" pre-selected. This matches the user's expectation that PayFast is the primary path when configured.
- Keep EFT as a manual choice, just not the default when online is available.

### 3. Clean up the stray order
- Delete `INV-00112` (id `2a4f7a80-a1c0-4010-a495-517d88abcc36`) and its order_items / documents so Test Branch isn't polluted with a misfired EFT order. Confirm before running.

No backend / RLS changes needed — the data and policies are correct; this is a frontend timing + default-selection bug.

## Out of scope
- Tenant-level PayFast creds (you've intentionally put them on the branch).
- Any change to the EFT flow itself.

Confirm and I'll implement, plus delete INV-00112 if you want it gone.
