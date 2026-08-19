# Tenant locale with branch override

Goal: the tenant sets one locale (metric or imperial, plus currency policy); each branch can inherit it or override it. For the demo: tenant metric, Branch A metric (inherit), Branch B imperial with USD/CAD.

## What already exists (verified)

- Tenant `regional.measurement_unit` (auto / metric / imperial) is saved from Admin → Settings → **Financial** tab, alongside default currency, lock, multi-currency and accepted currencies.
- Branch overrides exist: `BranchRegionalCard` (unit + default currency + sellable currencies, with an "Inherit from tenant" option) writes `branch_settings`, and is mounted only on the **branch's own** Settings page.
- `resolve_catalog_unit_system(tenant, branch)` already resolves branch-first via `resolve_branch_setting`; `useRegionalPricing` and `useMeasurementUnit` already prefer the branch.
- `clone_tenant_catalog_to_branch` already filters sizes / papers / finishing by the branch's resolved unit system.

## Gaps to close

1. **Tenant admin cannot set a branch's locale.** `AdminBranchDetail` has Details / Identity / Users / Capabilities / Payments / Subscription / Delivery — no Regional tab. Add one mounting `BranchRegionalCard`, so both demo branches can be configured from the tenant admin without logging into each branch.

2. **Tenant locale is buried under "Financial".** Split the measurement-system control into its own **Regional & Locale** card at the top of that tab (or a sibling tab), stating plainly that it is the tenant default and branches may override it, and listing which branches currently override.

3. **Product links break for an imperial branch.** In `clone_tenant_catalog_to_branch`, the `product_catalog_links` copy keeps the source (metric) `item_code` and then requires that code to exist in the branch catalogue. On an imperial branch the branch rows carry imperial codes, so every size / paper / finishing link is dropped and the branch's products lose their option lists. Fix: map each link's `item_code` through `catalog_unit_twin_code` for the branch's unit system before the existence check, same as `resolve_product_options` already does.

4. **Changing a branch's unit doesn't rebuild its catalogue.** Saving Imperial leaves the branch holding metric rows. After a unit change, `BranchRegionalCard` prompts and (on confirm) calls `resync_branch_catalog_from_tenant`, which already deletes and re-clones — with a clear warning that branch-level catalogue and price edits are discarded.

5. **Currency sanity.** When a branch is set to imperial, default the sellable list to USD/CAD (suggestion only, still editable); warn in the card when the branch default currency isn't in its sellable list.

## Technical notes

- Migration: rewrite the `product_catalog_links` block of `clone_tenant_catalog_to_branch` to resolve `item_code` via `catalog_unit_twin_code(catalog, item_code, unit)` and dedupe on the mapped code. No schema change.
- Front end: new `regional` tab in `src/pages/admin/AdminBranchDetail.tsx`; `BranchRegionalCard` gains the resync confirm (`useCatalogCascade`'s `resync_branch_catalog_from_tenant`) and the currency-suggestion logic; `FinancialTab.tsx` gets the locale card extracted with copy about branch override.
- No change to `resolve_catalog_unit_system`, `useRegionalPricing` or `useMeasurementUnit` — the cascade is already branch-first.

## Demo outcome

Tenant = metric / ZAR. **Demo Branch** inherits (metric, ZAR + GBP/AUD/NZD). **Demo Branch USA & Canada** = imperial, USD default, USD/CAD sellable, catalogue resynced to the imperial master so covers show `100lb Silk`, sizes show Letter / Legal, and prices show in USD.
