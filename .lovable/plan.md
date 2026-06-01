## Problem

Customers ordering from any PostNet branch hit:
> "This branch's subscription is not active. New orders are paused."

Root cause: every branch subscription is created with `billing_status = 'pending_payment'` and `status = 'incomplete'` — even when the assigned plan has `price = 0` (e.g. the "Doc Centre Postnet" plan in ZAR/all regions except one is R0). The `order-engine` gate then refuses orders.

For free plans (price 0 or 100% discount) there is nothing to pay, so they should be admitted automatically.

## Fix

### 1. `apply_tenant_plan_to_branches` RPC

When inserting/upserting branch_subscriptions, compute the effective price per branch from `platform_pricing_plans` + tenant discount:

- Look up the plan row by `(plan_slug, region_id)` (fall back to any region row for the slug if region_id is null).
- Effective price = `plan.price` with tenant discount applied (`percentage` or `fixed_amount`).
- If effective price ≤ 0 → `billing_status = 'free'`, `status = 'active'`.
- Else → `billing_status = 'pending_payment'`, `status = 'incomplete'` (current behaviour).

Also set `status` on insert (currently never set, leaving it null).

### 2. `assign-branch-plan` edge function

Same logic: resolve plan price + discount, set `billing_status`/`status` accordingly instead of hard-coding `pending_payment`.

### 3. `order-engine` gate

No code change needed — it already treats `billing === 'free'` and `status === 'active'` as allowed. Once the data is right, orders go through.

### 4. Backfill existing PostNet (and any other free-plan) rows

One-off SQL inside the migration:

```sql
UPDATE branch_subscriptions bs
SET billing_status = 'free', status = 'active', updated_at = now()
FROM platform_pricing_plans p
WHERE bs.assigned_plan_slug = p.plan_slug
  AND (bs.region_id = p.region_id OR bs.region_id IS NULL)
  AND p.price = 0
  AND bs.billing_status = 'pending_payment';
```

(Same idea extended to honour 100% discounts.)

## Files

- `supabase/functions/order-engine/index.ts` — no change
- `supabase/functions/assign-branch-plan/index.ts` — price/discount aware billing_status
- New migration:
  - replace `apply_tenant_plan_to_branches` with price-aware version
  - backfill `branch_subscriptions` for already-assigned free plans

## Out of scope

- Per-branch Stripe checkout for paid plans (unchanged).
- Tenant-level Subscription card (already simplified).
- Trial logic (`trial_days` > 0) — current code leaves trial handling to Stripe flow; not changed here.
