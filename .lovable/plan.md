## Goal

When a brand-new branch is spun up, the branch admin should walk into a Pricing page that is already populated with the tenant's catalogue + rate-card rows — no manual "Pull missing from tenant" clicks. Pack pricing already cascades via fallback resolver so it needs no clone.

## Approach

Add a one-shot server-side seed that runs the two existing clone RPCs, guarded by a "seeded" flag so it's safe to call repeatedly and free after first run. Trigger it in two places for belt-and-braces:

1. **At branch creation** (provision path), so the data is already there before the admin logs in.
2. **On first branch-portal load** (safety net for existing empty branches and any race), via a cheap idempotent RPC call from `BranchLayout`.

## Changes

### 1. Migration — `ensure_branch_pricing_seeded(_branch_id uuid)`

- Add `pricing_seeded_at timestamptz` column to `public.branches` (nullable).
- New `SECURITY DEFINER` function `public.ensure_branch_pricing_seeded(_branch_id uuid)`:
  - Returns early if `pricing_seeded_at IS NOT NULL`.
  - Authorises the caller: must be platform admin, tenant owner/admin of the branch's tenant, or a member of the branch itself (reuse existing helpers like `has_role` / `is_tenant_admin`).
  - Calls `public.clone_tenant_catalog_to_branch(_branch_id)` then `public.clone_tenant_pricing_to_branch(_branch_id)`.
  - Sets `pricing_seeded_at = now()` on `branches`.
  - Wrapped in exception block so a clone failure doesn't leave the flag half-set (only stamp on success).
- `GRANT EXECUTE ... TO authenticated`.

### 2. Server-side trigger at branch creation

- In the branch creation path (edge function that inserts into `branches` and/or `provision-branch-admins`), call `ensure_branch_pricing_seeded` for each newly created branch immediately after insert. Investigate which edge function is used today (`create-branch` / `provision-branch-admins` / direct client insert) and hook the call in the correct spot.

### 3. Client safety net — `BranchLayout`

- New tiny hook `useEnsureBranchPricingSeeded(branchId)` that calls the RPC once per session per branch id (guarded by a `useRef`/session flag) and no-ops after the flag is set server-side.
- Invoked from `BranchLayout.tsx` alongside the existing branding/unread hooks.
- On success, invalidates the same query keys that `useClonePricingToBranch` + `useCloneTenantCatalogToBranch` invalidate, so the Pricing page reflects freshly seeded rows if the user is already sitting on it.

### 4. One-shot backfill

- Data update (via insert tool): for every existing branch where `pricing_seeded_at IS NULL`, call `ensure_branch_pricing_seeded` so the current empty demo branches (like `Demo3new`) get populated without waiting for the next login.

## Explicit non-goals

- Pack pricing overrides — not cloned. The resolver already falls back branch → tenant → master, so a missing branch row is correct behaviour.
- The manual "Pull missing from tenant" and "Re-sync from tenant" buttons stay put; they remain the way to re-pull after the tenant catalogue changes later.
- No change to the onboarding "Mark prices reviewed" flow — it still needs an explicit click.

## Verification

- Create a new demo branch → send activation → log in → navigate straight to Pricing: Paper Stocks, Finishing, Click Charges, Photo Prints and Business Cards tabs are all populated from the tenant without pressing any button.
- Reload — no duplicate rows (RPCs are additive/idempotent, and the flag short-circuits).
- Existing seeded branch: RPC returns instantly, no query invalidations churn.
