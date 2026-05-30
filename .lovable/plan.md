## Root cause

After the branch-lockdown migration:

- `user_is_staff_for(app_id, tenant_id)` was narrowed to **exclude** `branch_manager` / `store_operator` (it now requires `tm.branch_id IS NULL` and a tenant-wide role).
- `user_can_read_order(app_id, tenant_id, ordered_by_profile_id)` only grants access via: `platform_admin` OR `user_is_staff_for(...)` OR customer-self. It **never** consults `user_is_staff_for_branch(...)`.
- A branch_manager therefore loses access to every table whose RLS depends solely on `user_can_read_order`.

The parent `orders` row still appears because of the legacy policy `Branch staff can view branch orders` (uses `user_branch_id()`), but the equivalent escape hatch doesn't exist on the child tables, so the detail page shows the order shell with empty Jobs / Pricing / Documents / Addresses / Payments.

Concretely, these SELECT policies still rely on `user_can_read_order` without a branch-staff fallback:

- `order_jobs.order_jobs_select_policy` ← the symptom in the screenshot ("No jobs in this order")
- `order_addresses.order_addresses_select_policy`
- `order_pricing_snapshots.order_pricing_snapshots_select_policy`
- `payments.payments_select_policy`
- `orders.orders_select_membership` (masked by the legacy `user_branch_id()` policy)

(Other order-scoped policies — `messages`, `job_proofs`, `order_documents`, `order_invoices`, `status_history`, `timeline_events`, `order_adjustments`, `email_outbox_select_staff` — already inline `user_is_staff_for_branch(...)` and behave correctly.)

## Fix

Single source of truth: extend `user_can_read_order` with a `p_branch_id` parameter and have it OR in `user_is_staff_for_branch(p_app_id, p_tenant_id, p_branch_id)`. Then update the five outstanding SELECT policies to pass `o.branch_id`.

### Migration

```sql
-- 1) New 4-arg version (keep old 3-arg in place during rollout, then drop)
CREATE OR REPLACE FUNCTION public.user_can_read_order(
  p_app_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_ordered_by_profile_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.user_is_staff_for(p_app_id, p_tenant_id)
    OR public.user_is_staff_for_branch(p_app_id, p_tenant_id, p_branch_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role = 'customer'
        AND (p_ordered_by_profile_id = auth.uid() OR tm.can_view_all_orders = true)
    )
  );
$$;

-- 2) Recreate the 5 affected SELECT policies to call the 4-arg form.
-- (orders_select_membership, order_jobs_select_policy, order_addresses_select_policy,
--  order_pricing_snapshots_select_policy, payments_select_policy)

-- 3) Update the existing inline-fallback policies (messages, job_proofs,
--    order_documents, order_invoices, status_history, timeline_events,
--    email_outbox_select_customer, order_payment_attempts) to call the new
--    4-arg form so they don't double-evaluate the branch check.

-- 4) Drop the legacy 3-arg user_can_read_order signature once nothing references it.
```

### Verification (post-migration)

Run as the branch_manager (`sandtoncityadmin@postnet.co.za`):

```sql
SET LOCAL ROLE authenticated; -- with their JWT
SELECT count(*) FROM order_jobs WHERE order_id = '14aa5e77-...';  -- expect 1
SELECT count(*) FROM payments WHERE order_id = '14aa5e77-...';    -- expect ≥ 1
```

Then reload `/branch/orders/14aa5e77-…` and confirm the Job List, Pricing, Delivery, and Payment cards populate.

### Out of scope

- Re-evaluating the legacy `Branch staff can view branch orders` / `user_branch_id()` policies (still active fallback, harmless given the stronger `user_is_staff_for_branch` checks).
- Edge function changes — `production-pdf` / `order-engine` already use `user_is_staff_for_branch` correctly.
- Photo-prints VPS assembly (separate workstream).
