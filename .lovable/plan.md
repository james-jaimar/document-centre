## Goal
For the **3at1** tenant, take every branch offline (`is_live = false`) except the `demo` branch, so branches only appear on the storefront once their subscription activates.

## Current state (verified)
- 3at1 has ~40+ branches. All except a handful are already `status='incomplete'` / `trial_status='not_started'` (no active subscription).
- Most of those are still flagged `is_live = true`, so their storefront routes resolve today.
- Only `demo` has an active comp'd subscription and should remain live.

## Change
One data update via the insert/update tool:

```sql
UPDATE branches b
SET is_live = false
FROM tenants t
WHERE b.tenant_id = t.id
  AND t.slug = '3at1'
  AND b.slug <> 'demo'
  AND b.is_live = true;
```

No schema change. No code change. The existing `BranchSlugRoute` already routes non-live branches to `StoreNotAvailable`, and the existing activation edge functions (`start-branch-trial`, `create-branch-checkout`, `stripe-webhook`) already flip `is_live = true` on successful trial start / paid activation, so branches will come back online automatically when their manager subscribes.

## Out of scope
- No change to the demo branch.
- No change to any branch that already has an active/trialing subscription (the WHERE clause leaves those alone if they happen to be live — but per the query above, `demo` is the only such 3at1 branch today).
