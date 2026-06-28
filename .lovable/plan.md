## Problem

The toast "Only owners or admins of this branch/tenant may perform this action (step: auth)" fires because `fetchOrderForAdmin` in `supabase/functions/order-engine/index.ts` (line 1245) still calls `assertOrderStaffAccess(..., { adminOnly: true })`. The previous edit added a comment claiming this was relaxed for branch managers, but the actual code was never changed. With `adminOnly: true`, only `owner`/`admin` roles pass — `branch_manager` is rejected.

## Fix

1. **Make `fetchOrderForAdmin` accept an `adminOnly` option** (default `true` to preserve current behaviour for all existing callers).

   ```ts
   async function fetchOrderForAdmin(
     admin, userId, order_id,
     opts: { adminOnly?: boolean } = { adminOnly: true },
   ) {
     ...
     const denied = await assertOrderStaffAccess(admin, userId, order as any, {
       adminOnly: opts.adminOnly !== false,
     });
     ...
   }
   ```

2. **In `adminChangeFulfillment`** (line ~1881), pass `{ adminOnly: false }` so any staff role allowed for that branch (`owner`, `admin`, `sales`, `production`, `accounts`, `branch_manager`, `store_operator`) can perform the change, consistent with the comment already in the code.

3. **Leave every other `fetchOrderForAdmin` call untouched** — they keep the stricter admin-only behaviour they had before.

## Verification

After redeploy: retry "Change fulfillment" as `branch_manager` on INV-00114. Expected: no auth-step toast; the flow proceeds to recompute totals and (with the checkbox ticked) send the payment-request email.