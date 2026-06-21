## Problem

The "Re-sync from Tenant" button on the branch Catalog Pricing page calls `public.resync_branch_catalog_from_tenant(branch_id)`, which gates execution behind `public.user_can_manage_branch_catalog(branch_id)`. That helper currently checks:

```sql
AND m.role IN ('Owner','Admin')
```

But the actual role values stored in `tenant_memberships` are lowercase and use a different vocabulary than the memory doc: `admin`, `branch_manager`, `store_operator`, `customer`. So the check **never matches anyone** — even the tenant admin (`hello@jaimar.dev`, role `admin`) and the branch manager (`hello@printmypics.co`, role `branch_manager`) both fail, and the function raises `Not authorised`.

The sibling function `user_is_tenant_admin` already uses the correct lowercase form (`'owner','admin'`), confirming this is just a bug in `user_can_manage_branch_catalog`.

## Fix

One small migration that recreates `public.user_can_manage_branch_catalog` with the correct, real-world role set:

- Tenant-level: `admin`, `owner` (membership with `branch_id IS NULL`) — can manage any branch in their tenant.
- Branch-level: `branch_manager`, `admin`, `owner` (membership whose `branch_id` matches) — can manage their own branch.
- Platform admins continue to bypass via `has_role(auth.uid(), 'platform_admin')`.

```sql
CREATE OR REPLACE FUNCTION public.user_can_manage_branch_catalog(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.branches b ON b.id = p_branch_id
    WHERE m.profile_id = auth.uid()
      AND m.is_active
      AND m.tenant_id = b.tenant_id
      AND (
        (m.branch_id IS NULL  AND m.role IN ('owner','admin'))
     OR (m.branch_id = p_branch_id AND m.role IN ('owner','admin','branch_manager'))
      )
  ) OR public.has_role(auth.uid(), 'platform_admin'::app_role);
$$;
```

This fixes both the failing RPC and the matching RLS policies on `catalog_sizes`, `catalog_print_attrs`, `catalog_papers`, `catalog_finishing`, `catalog_paper_prices`, `catalog_finishing_prices`, and `product_catalog_links` (they all delegate to the same helper), so branch admins/branch managers can edit and re-sync their catalog pricing.

## Out of scope

- No schema changes, no policy churn beyond the function body.
- No UI changes; the existing button and toast are correct.
- Tenant-level resync (`resync_tenant_catalog_from_master`) already uses `user_is_tenant_admin`, which is fine.
