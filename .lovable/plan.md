# Fix branch creation failure and "Branch unavailable" checkout block

Two separate faults, both confirmed against the live database.

## What is actually wrong

**1. Creating a branch fails (database error).**
Every new branch runs an automatic seeding trigger that copies the tenant catalogue down to the branch. That copy function calls a helper with the catalogue type passed in its raw enum form, but the helper only accepts plain text — so Postgres cannot find a matching function and raises:

`function public.catalog_code_in_unit(catalog_kind, text, text, text) does not exist`

The seeding step is intentionally un-shielded (so a half-seeded branch never ships), which means the error rolls back the whole insert and no branch is created. The equivalent function used elsewhere (`resolve_product_options`) already casts correctly — the catalogue clone is the only place missing the cast.

**2. Checkout says "Branch unavailable" for Impress.**
Impress Print Calendars currently has 0 branches (confirmed). The storefront entitlement gate is given `undefined` as the branch id; the underlying entitlement query never runs, so the gate reads "no data" and falls through to its blocked state with the message "Branch unavailable." A tenant with no branch is treated identically to a suspended branch.

## The fix

**Database migration**
- Recreate `clone_tenant_catalog_to_branch` with `s.catalog::text` on both the `catalog_code_in_unit` and `catalog_unit_twin_code` calls. No other logic changes.
- Verify by creating a branch for Impress afterwards.

**Frontend gate**
- `useBranchStorefrontGate`: when no branch id is supplied, return "not blocked" instead of "Branch unavailable." A missing branch is a tenant-configuration state, not a suspended store.
- Keep the real blocking behaviour untouched for branches that exist but are restricted, past due, or cancelled.
- `StorefrontEntitlementGuard` and `Checkout` then behave correctly for branchless tenants; `Checkout` still requires a collection branch when the customer picks collection, which is the correct separate check.

## After the fix

Impress can be given a branch from the platform admin (branch creation will succeed), which also unlocks branch-scoped pricing and collection for that tenant. Until a branch exists, checkout will proceed on the tenant-level configuration rather than being blocked.

## Technical notes

- Migration: `CREATE OR REPLACE FUNCTION public.clone_tenant_catalog_to_branch(uuid)` — cast only, same body otherwise.
- Files touched: `src/hooks/useBranchSubscriptions.ts` (line 171 branch of `useBranchStorefrontGate`).
- Trigger chain involved: `branches_clone_pricing_aft_ins` → `trg_clone_pricing_for_new_branch` → `clone_tenant_catalog_to_branch`.
