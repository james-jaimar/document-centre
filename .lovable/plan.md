

## Plan: Ringfence Customers to Tenants and Branch-Scoped Orders

### Problem Summary
Currently, customer registration creates a profile and a `customer` role in `user_roles`, but **no `tenant_membership` row** is created. Orders rely on `profiles.tenant_id` which is fragile. There's no branch selection at checkout, and no mechanism to tag orders with a branch for collection-based workflows.

### Changes

**1. Storefront-Aware Customer Registration (DB trigger)**

Update `handle_new_user()` to also create a `tenant_membership` when the user signs up through a storefront URL. The storefront slug will be passed via `raw_user_meta_data.tenant_slug` during signup.

- Modify `Auth.tsx` (storefront variant at `/t/:slug/auth`) to include `tenant_slug` in the signup metadata
- Update the `handle_new_user()` DB function to:
  - Look up the tenant by slug from metadata
  - If found, create a `tenant_membership` row with role `customer`, the correct `app_id` and `tenant_id`
  - Set `profiles.tenant_id` for backwards compatibility

**2. Storefront Auth Page**

Create a `/t/:slug/auth` route that renders the existing Auth page but passes the tenant slug into signup metadata. This ensures customers who register via a storefront are automatically ringfenced to that tenant.

**Files**: `src/App.tsx`, `src/pages/Auth.tsx` — accept optional `slug` prop or read from params

**3. Branch Selection at Checkout**

For "collection" delivery method, allow the customer to pick a branch:
- Fetch active branches for the tenant
- Show a branch selector dropdown when "Collection" is chosen
- Save the selected `branch_id` on the order when placing it
- This tags the order so branch staff see it in their portal

**Files**: `src/pages/dashboard/Checkout.tsx`, `src/hooks/useCart.ts` (placeOrder mutation)

**4. Ensure `app_id` on Orders**

Currently `useCreateOrder` and `getOrCreateCartId` don't set `app_id` on orders. Fix both to pull `app_id` from the user's `tenant_membership` (via `TenantContext`) and write it to the order. This is critical for RLS policies and the order engine.

**Files**: `src/hooks/useOrderBuilder.ts`, `src/hooks/useCart.ts`

**5. Branch Portal Order Scoping**

The `BranchOrders` page should filter by `branch_id` from the user's membership. Verify the existing implementation correctly passes `branch_id` to the query and that RLS allows it.

**Files**: `src/pages/branch/BranchOrders.tsx`

**6. RLS Policy Review**

- Orders: The existing `Branch managers can view branch orders` policy checks `tenant_id` but not `branch_id`. Add a proper branch-scoped policy that also checks `branch_id` matches the user's membership `branch_id`.
- Ensure branch staff can only see orders tagged with their branch.

**Migration**: New `SECURITY DEFINER` function `user_branch_id()` that returns the branch_id from the user's tenant_membership, then use it in a revised RLS policy.

### Migration SQL (Summary)

```sql
-- 1. Update handle_new_user to auto-create tenant_membership
CREATE OR REPLACE FUNCTION public.handle_new_user() ...

-- 2. Helper: get user's branch_id
CREATE OR REPLACE FUNCTION public.user_branch_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT branch_id FROM tenant_memberships
  WHERE profile_id = auth.uid() AND is_active = true
  AND branch_id IS NOT NULL LIMIT 1;
$$;

-- 3. Replace branch manager order policy with branch_id check
DROP POLICY "Branch managers can view branch orders" ON orders;
CREATE POLICY "Branch staff can view branch orders" ON orders
  FOR SELECT USING (
    branch_id = public.user_branch_id()
    AND branch_id IS NOT NULL
  );
```

### What You Haven't Thought Of (Item 3)

- **Existing users without memberships**: Need a one-time data fix to create `tenant_membership` rows for any existing customers who have `profiles.tenant_id` set but no membership
- **Cross-tenant prevention**: Customers should not be able to browse `/t/other-tenant/` storefronts and place orders there. The order creation must validate that the user's membership matches the storefront tenant
- **Branch transfer**: If a customer picks Branch A for collection but the order needs to be fulfilled at Branch B, admin should be able to reassign `branch_id` — this already works via the admin order detail page
- **Multi-branch customers**: Some B2B customers may order from multiple branches. The membership model supports this (multiple memberships with different `branch_id`), but the UI would need a branch picker on login or in the customer portal

### File Change Summary

| File | Change |
|------|--------|
| Migration | `handle_new_user`, `user_branch_id()`, RLS policy |
| `src/pages/Auth.tsx` | Accept tenant slug, pass in signup metadata |
| `src/App.tsx` | Add `/t/:slug/auth` route |
| `src/pages/dashboard/Checkout.tsx` | Branch selector for collection |
| `src/hooks/useCart.ts` | Pass `branch_id` and `app_id` on order creation |
| `src/hooks/useOrderBuilder.ts` | Set `app_id` on draft orders |
| `src/pages/branch/BranchOrders.tsx` | Verify branch_id filtering |
| Data fix (insert tool) | Backfill memberships for existing customers |

