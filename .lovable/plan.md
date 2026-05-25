## Goal

Stop using "overrides + fallback to tenant" for branch pricing. Instead, every branch gets a **full copy** of the tenant's pricing the moment it's created, and the branch manager edits their own copy line-by-line. No inheritance at read time.

This applies to **both** pricing surfaces shown in the screenshots:

1. `pricing_rules` (Branch Pricing page — per-page/per-doc/surcharge rules)
2. `rate_card_*` tables (Click Charges, Paper Stocks, Finishing, Photo Prints, Business Cards)

## Schema changes

### `rate_card_*` tables — add a `branch` scope

Today they have `scope_type ∈ ('master','tenant')` with `tenant_id`. Extend to:

- `scope_type ∈ ('master','tenant','branch')`
- Add nullable `branch_id uuid references branches(id) on delete cascade`
- Update unique constraints to include `branch_id` (so a tenant copy and a branch copy can coexist)
- Update RLS so branch staff can read/write rows where `branch_id = user_branch_id()` and tenant admins can manage all branch rows under their tenant

Applies to all five tables: `rate_card_clicks`, `rate_card_papers`, `rate_card_finishing`, `rate_card_photo_prints`, `rate_card_business_cards`.

### `pricing_rules`

No schema change — it already has `branch_id`. Just change how it's used (see below).

## New SQL functions

1. **`clone_tenant_pricing_to_branch(p_branch_id uuid)`** — copies every `scope_type='tenant'` rate-card row into a matching `scope_type='branch'` row for the branch (skip rows that already exist for the branch). Also copies every `pricing_rules` row where `tenant_id=<branch's tenant>` and `branch_id IS NULL` into a new row with `branch_id = p_branch_id`.

2. **Trigger** on `branches` AFTER INSERT → call `clone_tenant_pricing_to_branch(NEW.id)` so new branches automatically get the full pricebook.

3. **Backfill migration** — for every existing branch, run the clone function once so the UI immediately shows a populated branch pricebook instead of an empty overrides list.

4. **Manual "Re-sync from tenant" RPC** (optional but useful) — `resync_branch_pricing_from_tenant(p_branch_id)` that deletes the branch's copies and re-clones. Exposed in the Branch Pricing UI as a button for tenant admins only.

## Read-path changes

### Rate-card hook (`useRateCard`)

When a `branchId` is in context, fetch `scope_type='branch' AND branch_id=...` only. Otherwise fall back to tenant scope. No merging.

### Pricing rules

- `usePricingRules` (storefront/order engine path): when called with a `branchId`, filter to `branch_id = branchId` only. Drop the current "or branch_id is null" fallback.
- `BranchPricing.tsx`: remove the two-section layout ("overrides" + "inherited"). Show a **single editable table** of the branch's own rules with Edit / Delete / New buttons, plus a "Re-sync from tenant" action.
- `usePricingRules` master-mode for platform admin is unchanged.

### Order engine / quote-pdf / any other consumer of `pricing_rules` or `rate_card_*`

Audit and switch any tenant-fallback queries to "branch-only when a branch is resolved on the job/order; tenant-only otherwise". The list of files to touch is the rg hits from earlier: `supabase/functions/order-engine`, `quote-pdf`, plus client helpers in `src/lib/orders/` that resolve pricing.

## UI changes

### `src/pages/branch/BranchPricing.tsx`

- Replace overrides+inherited layout with a single editable rules table (same look as `AdminPricing`).
- Header gains a "Re-sync from tenant pricing" button (confirms with a destructive AlertDialog — "this will overwrite all your branch rules").
- All create/edit calls always set `tenant_id` and `branch_id` to the current context.

### New `src/pages/branch/BranchRateCard.tsx` (or extend existing)

- Mirror `RateCardEditor` but pass a new `scope="branch"` with `tenantId` + `branchId`.
- `RateCardEditor` learns the `branch` scope: queries / inserts / updates / deletes all carry `branch_id`.
- Add the same "Re-sync from tenant" button at the top of each tab.

### Branch sidebar

Add a "Rate Card" entry under the branch portal nav (sibling of "Pricing") so branch managers can reach the new editor.

## Migration / rollout order

1. Migration: add `branch_id` + new scope to rate-card tables, RLS updates, clone + resync RPCs, and the new branch trigger.
2. Data backfill: for every existing branch, call `clone_tenant_pricing_to_branch`.
3. Client code: switch read paths, rewrite `BranchPricing`, add `BranchRateCard`, extend `RateCardEditor`, update sidebar nav.
4. Edge functions: switch resolver queries to branch-only-when-branch-present.
5. Leave the old `product_price_overrides` table alone for now — it's a separate concept (per-SKU prices) and not in scope here.

## Notes / trade-offs

- Storage cost goes up (every branch now has its own copy of every rule) but reads get simpler and faster — no UNION / OR queries.
- Tenant edits no longer automatically propagate. The "Re-sync from tenant" button is the explicit way to pull tenant changes down to a branch.
- We're not deleting the existing `branch_id`-scoped rules already in `pricing_rules`; the backfill will simply add the missing tenant-cloned rows, so any existing branch override is preserved as-is.
