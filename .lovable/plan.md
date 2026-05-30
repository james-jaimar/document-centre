## Problem

Saving the Tax/VAT Override card returns `new row violates row-level security policy for table "branch_settings"`.

## Root cause

The `Admins can manage branch settings` policy on `public.branch_settings` only allows membership roles `('owner', 'admin')`. The logged-in user on `/branch/settings` has role `branch_manager` (confirmed via `tenant_memberships`), so both INSERT and DELETE are rejected by RLS.

## Fix

Migration: drop and recreate the write policy on `public.branch_settings` so a branch's own manager can also edit *that branch's* settings.

```sql
DROP POLICY "Admins can manage branch settings" ON public.branch_settings;

CREATE POLICY "Admins and branch managers can manage branch settings"
  ON public.branch_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id = branch_settings.tenant_id
        AND m.profile_id = auth.uid()
        AND m.is_active = true
        AND (
          -- tenant-wide owner/admin: any branch
          (m.role IN ('owner', 'admin') AND (m.branch_id IS NULL OR m.branch_id = branch_settings.branch_id))
          -- branch manager: only their own branch
          OR (m.role = 'branch_manager' AND m.branch_id = branch_settings.branch_id)
        )
    )
  )
  WITH CHECK ( ...same predicate... );
```

No frontend changes required — `BranchTaxCard` already sends the correct payload.

## Out of scope

- Adding other branch-scoped write roles (Sales, Production, Accounts). VAT is a manager-level concern; we keep the surface tight. Easy to extend later.
