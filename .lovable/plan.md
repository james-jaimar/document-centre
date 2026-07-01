## Problem

Branch admin toggled PayFast **off** on the branch, but customers still see the PayFast option at `/demo/checkout`. Hard refresh doesn't help — the data source itself is wrong.

## Root cause

`src/pages/dashboard/Checkout.tsx` (lines 70–104) queries `branch_payment_gateways` directly from the browser and **does not read `is_enabled`**. It only checks whether `credentials_secret_id` exists, so a branch that has saved credentials but toggled the provider off still shows up.

The backend (`supabase/functions/_shared/payments.ts` → `resolveGatewaysForOrder`) already respects `bpg.is_enabled === false` correctly — that's why `ReorderPaymentDialog` and `CustomerOrderDetail` (which go through the edge function) behave correctly. Only the Checkout page is broken.

## Fix

In `src/pages/dashboard/Checkout.tsx`, update the `online-gateways` query:

1. Include `is_enabled` in the branch select:
   ```
   .select("provider, credentials_secret_id, mode, is_enabled")
   ```
2. In the `.filter(...)` block, drop any provider where the branch row exists and `b.is_enabled === false` — mirroring the edge-function rule (branch opt-out wins even if tenant is enabled and credentials exist).

No schema, RLS, or edge-function changes needed. Other checkout/pay entry points already use the edge function and are unaffected.

## Verification

- Toggle PayFast off on Demo branch → reload `/demo/checkout` → only EFT visible.
- Toggle back on → PayFast reappears.
- Reorder dialog and "Pay now" from order detail continue to behave correctly (unchanged path).
