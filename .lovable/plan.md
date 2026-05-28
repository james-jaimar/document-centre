# Branch-level delivery overrides

Good news: the zones/rates side already supports branch overrides — `delivery_zones`, `delivery_zone_locations`, and `delivery_rates` all carry `scope_type='branch'`, the `quote_delivery_rate` RPC prefers branch over tenant over platform, and `AdminBranchDelivery` already wraps `DeliveryEditor scope="branch"` with a "Reset from tenant" clone.

The gap is the **methods on/off** side and a few polish items so a branch operator can fully run their own pricing without their tenant overriding them.

## What to add

### 1. Per-branch method visibility (DB)

Extend `tenant_delivery_method_overrides` so branches can disable a method that's enabled tenant-wide.

- Add nullable `branch_id uuid references public.branches(id) on delete cascade`.
- Drop the existing unique constraint on `(tenant_id, method_id)`; replace with a partial-unique pair:
  - `unique (tenant_id, method_id) where branch_id is null` (tenant-level)
  - `unique (tenant_id, branch_id, method_id) where branch_id is not null` (branch-level)
- RLS: extend tenant-admin policy to also allow branch managers/store operators to write rows where `branch_id` matches their membership.

### 2. Resolution order in `quote_delivery_rate`

Update the override join so the effective enabled flag is: **branch override → tenant override → method default (true)**. If a branch row exists with `is_enabled=false`, the method is hidden for that branch even if tenant-enabled, and vice versa.

### 3. Frontend — `DeliveryEditor` Methods panel

When `scope === "branch"`:

- Query overrides for both `(tenant_id, branch_id is null)` and `(tenant_id, branch_id = branchId)`.
- Show effective state per method (branch override wins, fallback to tenant override, fallback to default).
- Toggling writes/deletes a **branch-scoped** override row, never touches the tenant row.
- Show a small "Tenant: off" badge next to methods the tenant has disabled, so the branch operator knows they're toggling against the tenant default.
- "Add method" stays tenant-scope only (branches don't invent new methods); hide that button in branch scope.

### 4. Frontend — `listShippingQuotes`

Currently fetches only tenant overrides. Also fetch branch overrides when `branchId` is set, merge with branch-wins precedence, and filter the methods list accordingly. (Defence in depth — the RPC already filters, but the client list should match.)

### 5. Branch-scoped clone helper

`clone_tenant_delivery_to_branch` already copies zones, locations, and rates. Extend it to also seed branch override rows by copying any tenant override rows for the same tenant (so "Reset from tenant" gives a true starting point). Operator can then flip individual methods on/off per branch.

## Files

- New migration: alter `tenant_delivery_method_overrides`, replace constraints, update RLS, rewrite `quote_delivery_rate` and `clone_tenant_delivery_to_branch`.
- `src/components/delivery/DeliveryEditor.tsx` — `MethodsPanel` gets `scope` + `branchId` props and uses branch overrides when in branch scope; hide "Add method" / "Delete" buttons in branch scope.
- `src/lib/delivery/quoteShipping.ts` — fetch + apply branch overrides in `listShippingQuotes`.
- Regenerated `src/integrations/supabase/types.ts` (auto).

## Result for the user

A branch owner opens **Admin → Branches → [Branch] → Delivery** and can:

- Hit "Reset from tenant" to seed everything.
- Set their own zone weight tiers / prices independently of tenant defaults.
- Switch individual courier methods on or off for their branch only, without the tenant's settings clobbering them.
