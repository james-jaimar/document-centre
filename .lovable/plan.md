## Problem

Creating a spec quote from the branch/admin portal fails with `new row violates row-level security policy for table "orders"`.

`QuoteSpecBuilder` inserts a `quoted` holding order with `user_id = customer profile id` (or the admin's own id as fallback), plus an `order_items` row. Current INSERT policies on `orders` and `order_items` only allow:

- `user_id = auth.uid()` (own orders), or
- `has_role(auth.uid(), 'platform_admin')`.

There is no INSERT policy for tenant/branch staff, even though there is already an equivalent UPDATE policy (`orders_update_staff_membership`) using `user_is_staff_for_branch(app_id, tenant_id, branch_id)`. So a branch admin creating a quote on behalf of a customer whose profile exists gets rejected.

## Fix

Add matching INSERT policies for staff, mirroring the existing update-side check.

### Migration

1. `CREATE POLICY orders_insert_staff_membership ON public.orders FOR INSERT TO authenticated WITH CHECK ((app_id IS NOT NULL) AND user_is_staff_for_branch(app_id, tenant_id, branch_id));`
2. `CREATE POLICY order_items_insert_staff_membership ON public.order_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.app_id IS NOT NULL AND user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)));`

Both are additive; the existing "own orders" and platform-admin policies remain, and the branch-subscription gate on orders still applies.

### No app-code changes required

`QuoteSpecBuilder` already sets `app_id`, `tenant_id`, `branch_id`, and marks the row `order_status = 'quoted'` with `metadata.is_spec_quote_holding = true` — those flags stay as-is.

## Verification

After migration, from the branch portal (`/branch/quotes/new-spec`) create a quote for a customer whose profile already exists. Expect the holding order + `order_items` + `quotes` + `quote_items` rows to insert without RLS error, and the redirect to `/branch/quotes/:id` to succeed.
