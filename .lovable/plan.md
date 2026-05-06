
## Problem 1: Branch staff cannot see order contents

The screenshot shows "No jobs in this order" and empty timeline — the order row loads but all child data is missing.

**Root cause**: The RLS helper functions `user_is_staff_for()` and `user_can_read_order()` only recognize roles `owner, admin, sales, production, accounts`. Branch roles (`branch_manager`, `store_operator`) are excluded. The `orders` table has a separate "Branch staff can view branch orders" policy that works, but child tables (`order_jobs`, `order_documents`, `payments`, `messages`, `timeline_events`, `order_addresses`) all delegate to these helper functions — so branch staff get empty results.

**Fix**: Update `user_is_staff_for()` to include `branch_manager` and `store_operator` in the role list, scoped to the user's assigned branch. This is the single-point fix that cascades to all child table policies.

```sql
CREATE OR REPLACE FUNCTION public.user_is_staff_for(p_app_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.app_id = p_app_id
        AND tm.tenant_id = p_tenant_id
        AND tm.is_active = true
        AND tm.role IN ('owner','admin','sales','production','accounts',
                        'branch_manager','store_operator')
    )
  );
$$;
```

This grants branch staff read AND write access to order child tables for orders in their tenant. Since branch staff should only see their branch's orders, the existing `orders` SELECT policy ("Branch staff can view branch orders") already limits which orders they can fetch. The child table policies join back to `orders`, so the branch scope is preserved transitively.

## Problem 2: Tenant branding on branch login

Branch users log in via `/t/:slug/auth` (the tenant auth page), which already applies branding from the previous implementation (logo, colors, gradient, favicon). This should already work.

However, the `BranchLayout` and `BranchSidebar` do not reflect tenant branding — they use generic sidebar styling. I will:

1. Add tenant branding to `BranchSidebar` — show the tenant logo instead of the generic Printer icon, and apply `primary_color` to the sidebar brand area.

## Changes

1. **Database migration** — Update `user_is_staff_for()` to include `branch_manager` and `store_operator`.
2. **`src/components/BranchSidebar.tsx`** — Fetch tenant branding and display logo/colors in the sidebar header.
