
## Bug

403 from `order-engine` when calling `cancelOrder`. The new `cancelOrder` action in the engine is rejecting the caller's permission check.

## Investigation

1. `code--view supabase/functions/order-engine/index.ts` — find the `cancelOrder` action and inspect the membership-role check (likely comparing role names case-sensitively, or checking the wrong column, or missing `tenant_id` lookup from the order before checking `tenant_memberships`).
2. `supabase--read_query` — confirm the calling user's `tenant_memberships` row for this tenant: role value, `app_id`, `is_active`.
3. `supabase--edge_function_logs order-engine` — get the exact rejection reason from the function log.

## Likely fixes (one of)

- Role check uses `['owner','admin']` but DB stores `'Owner'`/`'Admin'` → normalise case.
- Check queries by `user_id + app_id` but membership is tenant-scoped → query by `tenant_id` derived from the order.
- Missing `is_active = true` filter making the row not match, or the opposite (filter too strict).
- Auth header not forwarded → `getUser()` returns null → 403. Confirm `supabase.functions.invoke` includes auth (it does by default, but worth confirming the engine reads `Authorization` header, not service role).

## Plan

1. Read engine + run a quick membership query to identify the exact mismatch.
2. Patch the `cancelOrder` permission check in `supabase/functions/order-engine/index.ts` to mirror the pattern used by other admin-only actions in the same file (e.g. `recordPaymentEvent`, `refundPayment`) so behaviour is consistent.
3. Return a clear `{ ok:false, error, diagnostics }` payload (status 200) so the client surfaces a useful toast instead of a bare 403.
4. Redeploy `order-engine` and retry cancel on INV-00014.

## Verification

- Cancel INV-00014 as PostNet Admin → success toast, order status flips to `cancelled`, customer email queued, timeline entry added.
- Cancel attempt as a non-admin role → friendly "not permitted" toast (not raw 403).

## Out of scope

- Reworking the whole engine auth model — only aligning `cancelOrder` with existing actions.
