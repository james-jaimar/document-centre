
## Goal

Allocate the subscription plan at the **tenant** level (Postnet). Every active branch then automatically inherits that plan. Stripe billing still happens per branch (one Stripe sub per branch), but assignment + plan changes are managed centrally.

## Changes

### 1. Database

Add tenant-level assignment fields to `tenants`:
- `assigned_plan_slug text`
- `assigned_region_id uuid references platform_pricing_regions(id)`
- `discount_type text`, `discount_value numeric`, `trial_days int`, `billing_notes text`

New RPC `apply_tenant_plan_to_branches(p_tenant_id uuid)`:
- For every active branch of the tenant, upsert a row in `branch_subscriptions` with the tenant's assigned plan/region/discount/trial.
- Overwrites existing `assigned_plan_slug` on every branch (per your choice).
- Leaves Stripe-managed fields (`stripe_subscription_id`, `status`, `current_period_*`) untouched so existing paid subs keep working; only the assigned plan + commercial terms are synced.
- SECURITY DEFINER, gated to platform_admin or tenant_admin.

Trigger on `branches` insert (when `is_active = true`): if the tenant has an assigned plan, seed a `branch_subscriptions` row for the new branch automatically.

### 2. Edge function

`assign-tenant-plan` (new): writes the assignment onto `tenants`, then calls `apply_tenant_plan_to_branches`. Returns a count of branches updated.

### 3. Tenant admin UI (`/admin/settings` → Billing tab)

Replace the current "Subscription" card (which today shows the tenant's own sub) with a **Tenant Subscription Plan** card that lets the tenant admin (and platform admin):
- Pick region + plan slug (only `scope='branch'` plans, since each branch pays its own).
- Optionally set discount / trial / notes.
- Save → calls `assign-tenant-plan` → toast shows "Applied to N branches".
- Shows the current assigned plan and last-applied timestamp.

The existing **Branch Subscriptions** overview table stays below it so the admin can see per-branch Stripe status (paid / past_due / etc.) at a glance.

### 4. Branch-level UI

Remove the per-branch "assign plan" controls (`BranchSubscriptionAssignCard` on `AdminBranchDetail`). Branch detail keeps a **read-only** subscription panel showing: inherited plan name, Stripe status, period dates, "Pay Now" if pending. No override.

The customer-facing `BranchSettings → Subscription` tab stays as today (payment + status), since payment is still per branch.

### 5. Platform tenants page

Optional small addition: column on `/platform/tenants` showing the tenant's assigned plan slug, so platform admins can see at a glance which tenants have a plan set.

## Out of scope

- No change to Stripe webhook routing — events still land on `branch_subscriptions` via `branch_id` metadata.
- No change to the gate logic — `branch_subscription_active()` keeps reading `branch_subscriptions`.
- Tenant-level Stripe subscription (the existing `tenant_subscriptions` row used for platform-only tenants without branches) is left intact; this flow only affects tenants that have branches.

## Migration / data backfill

For Postnet specifically: once you set the tenant plan in the UI and click Save, the new RPC will populate every active Postnet branch in one shot. No manual SQL needed.
