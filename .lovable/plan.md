## Problem

Branch-level PayFast credentials are saved correctly (the "Credentials saved" badge is truthful — secret rows exist in `branch_payment_gateways`). But the checkout page only shows EFT, because the customer's anonymous storefront session is **blocked by RLS** from reading `branch_payment_gateways`.

Current policies on that table:
- `bpg_platform_admin_all` — platform admins
- `bpg_tenant_admin_all` — tenant admins
- `bpg_branch_manager_all` — branch managers

There is no storefront-read equivalent to the one that already exists on `tenant_payment_gateways` (`tpg_storefront_read_enabled`), so the Checkout query at `src/pages/dashboard/Checkout.tsx` lines 74-79 returns zero rows for shoppers and PayFast gets filtered out.

## Fix

Add a single storefront-read RLS policy on `branch_payment_gateways`, mirroring the tenant-level one and gated by the same `current_storefront_tenant_id()` header guard so it's safe:

```sql
CREATE POLICY bpg_storefront_read
  ON public.branch_payment_gateways
  FOR SELECT
  USING (
    current_storefront_tenant_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_payment_gateways.branch_id
        AND b.tenant_id = current_storefront_tenant_id()
    )
  );

GRANT SELECT ON public.branch_payment_gateways TO anon, authenticated;
```

This only exposes the existence of a `credentials_secret_id` and the `mode` — no actual secret material (the encrypted secret lives in the vault, accessed only via `read_payment_secret` from edge functions).

## No frontend changes needed

The existing Checkout query already handles branch overrides correctly — it just needs to be able to read the row. After the migration:
- Hard refresh the storefront checkout
- PayFast will appear under Payment Method alongside EFT

## Files touched

- One new migration adding the policy + grants. No code changes.
