## Root cause (confirmed)

`get_tenant_customers_for_branch(uuid)` (migration `20260721172500`) selects `b.app_id` from `public.branches`, but that column lives on `tenants`, not `branches`. The RPC therefore errors out with `column b.app_id does not exist`, so `useTenantCustomersForBranch` returns an empty list and the quote customer picker shows nothing — even the customer who already ordered at Demo2.

Verified via `\d branches` (no `app_id`) and a direct `SELECT get_tenant_customers_for_branch(...)` call, which fails once the auth check is passed.

## Fix

New migration replacing the function so it resolves `app_id` from `tenants` instead of `branches`:

```sql
CREATE OR REPLACE FUNCTION public.get_tenant_customers_for_branch(_branch_id uuid)
RETURNS TABLE (...)  -- same signature
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _app_id uuid;
BEGIN
  IF NOT public.caller_has_branch_access(_branch_id) THEN
    RAISE EXCEPTION 'Not authorised for branch %', _branch_id USING ERRCODE = '42501';
  END IF;

  SELECT b.tenant_id, t.app_id
    INTO _tenant_id, _app_id
  FROM public.branches b
  JOIN public.tenants  t ON t.id = b.tenant_id
  WHERE b.id = _branch_id;
  ...
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_customers_for_branch(uuid) TO authenticated;
```

Everything else in the function (order stats scoped to `_branch_id`, membership filter on tenant + role = 'customer') stays the same. The 357 active `customer` memberships already in the DB mean the picker will populate as soon as the column reference is corrected.

## Validation

- Re-run `SELECT get_tenant_customers_for_branch('<demo2 branch id>')` as a caller with access; expect rows including the existing Demo2 customer plus any other Postnet-tenant customers.
- In the UI: Demo2 → Quotes → New quote → customer picker now lists tenant customers; Customers page continues to show only branch-scoped customers (unchanged).

## Summary

One-line bug: wrong column reference in a SECURITY DEFINER RPC. One migration fixes it; no frontend changes required.