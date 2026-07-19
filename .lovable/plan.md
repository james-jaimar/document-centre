## Goal
Allow branch/admin staff to create spec-based quotes end-to-end, including the holding `order_items` row, without weakening customer/order access.

## Confirmed current state
- The `orders` insert is now succeeding: recent spec quote holding orders exist in the database.
- The remaining failure is on the next step: inserting into `order_items`.
- `order_items` has an additive staff insert policy, but the check depends on reading the just-created `orders` row through the policy expression.
- The failing branch has an active `branch_manager` membership for the expected `app_id`, `tenant_id`, and `branch_id`.

## Plan
1. **Replace the fragile `order_items` staff insert policy**
   - Drop/recreate `order_items_insert_staff_membership` so it mirrors the order staff rule using a `SECURITY DEFINER` helper instead of relying on policy-time visibility of `orders`.
   - The helper will validate: given an `order_id`, the authenticated user is staff for that order’s `app_id`, `tenant_id`, and `branch_id`.

2. **Keep access scoped**
   - Only authenticated tenant/branch staff, platform admins, or the order owner can insert items.
   - No public/anonymous widening.
   - Existing customer-owned order item policy remains unchanged.

3. **Clean up failed partial quote attempts**
   - Remove only orphaned spec-quote holding orders created by the failed flow that have no `order_items` and no linked `quotes` row, so the database is not cluttered by failed attempts.

4. **Validate after migration**
   - Re-check the effective `order_items` policies.
   - Confirm no orphan holding orders remain from the failed attempts.
   - Then you can retry the branch quote creation; it should proceed past `order_items` into `quotes` and `quote_items`.