## Root cause (confirmed)

`create_spec_quote` validates the branch with:

```sql
WHERE b.id = p_branch_id
  AND b.tenant_id = p_tenant_id
  AND (b.app_id = p_app_id OR b.app_id IS NULL)
```

But `public.branches` has no `app_id` column (verified via `information_schema.columns`). Branches are scoped by `tenant_id` only; the app is inherited from the tenant. So the very first branch check inside the RPC throws `column b.app_id does not exist`, aborting the whole quote insert.

## Fix

One small migration that replaces the function body's branch guard — no other logic changes.

- Drop `b.app_id` from the `EXISTS` check.
- Keep `b.id = p_branch_id AND b.tenant_id = p_tenant_id`.
- Everything else in the RPC (orders/order_items/quotes/quote_items inserts, grants, staff check) stays exactly as-is.

No frontend changes. No policy changes. No new helpers.

## Verification

After the migration runs, retry "Create quote" from the branch quote builder — the RLS layer is already correct, so the insert should succeed and return `{ id, quote_number }`.
