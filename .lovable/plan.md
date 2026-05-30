## Root cause

There are two parallel subscription tables and the upload gate only looks at one:

- **`tenant_subscriptions`** — what the platform "Subscription Management" page writes. For `demo` it's `plan=core, status=active, billing_status=free`.
- **`branch_subscriptions`** — what the gate (`branch_subscription_active(branch_id)`) reads. For `demo` there are **zero rows**, so every branch returns "not active → uploads paused".

So setting Free/Active on the platform Subscriptions page never propagates to branches. Only the newer tenant-admin "Tenant Subscription Plan" card (`assign-tenant-plan` → `apply_tenant_plan_to_branches`) writes branch rows, and even that defaults branches to `pending_payment`, not `free`.

Two things to fix:

1. The gate should treat `tenant_subscriptions.billing_status='free'` or `status in ('active','trialing')` as an unblock for every branch under that tenant (and always allow demo tenants).
2. The platform Subscriptions page should cascade to `branch_subscriptions` when you mark a tenant Free/Active, so the two tables stop drifting.

## Plan

### 1. Migration — widen `branch_subscription_active`

Replace the function so a branch is "active" if **any** of:

- the existing `branch_subscriptions` row says active/trialing/paid/free, OR
- the parent tenant's `tenant_subscriptions` row has `status in ('active','trialing')` or `billing_status in ('paid','free')`, OR
- the parent tenant has `is_demo = true`.

Keep signature and `SECURITY DEFINER` / `search_path` as-is so all existing RLS and call sites keep working.

### 2. Migration — backfill `branch_subscriptions` for demo + any tenant already marked free/active

For every tenant where `tenant_subscriptions.billing_status in ('free','paid')` or `status='active'`, upsert one `branch_subscriptions` row per active branch with the matching plan, `status='active'`, `billing_status='free'` (or `'paid'`). Idempotent — uses the existing unique `(branch_id)` constraint.

### 3. Edge function — cascade from platform Subscriptions page

`supabase/functions/upsert-tenant-subscription` (the function called by `useTenantSubscriptions`): after writing the `tenant_subscriptions` row, if it ends up `billing_status in ('free','paid')` or `status in ('active','trialing')`, call `apply_tenant_plan_to_branches` (or inline the same upsert) and stamp the resulting branch rows with the same `status` + `billing_status` so the gate sees them immediately.

If the tenant is moved back to `pending_payment`/`cancelled`, flip the branch rows to match too — otherwise cancelling on the platform page would leave branches "stuck on free".

### 4. No frontend changes required

`useBranchSubscriptionGate` already returns "active" when `billing_status='free'`, so once (1)–(3) land, the demo tenant immediately unblocks across every branch and the platform Free/Active toggle becomes the single source of truth.

### Files touched

- `supabase/migrations/<new>.sql` — replace `branch_subscription_active`, backfill rows.
- `supabase/functions/upsert-tenant-subscription/index.ts` — cascade to branches.
- (No client changes.)

### Verification

After deploy:

- `select branch_subscription_active(id) from branches where tenant_id = '<demo>'` → all `true`.
- Customer upload on demo storefront no longer shows "subscription is not active".
- Toggling `postnet` back to `pending_payment` on the platform page re-locks its branches.
