# Branch-level locale: units + currency

Two demo storefronts instead of one mixed one:

- **Demo Branch (Metric)** — UK / South Africa / Australia / New Zealand. Metric catalogue. Currencies: GBP, ZAR, AUD, NZD (geo-picked).
- **Demo Branch USA/Canada (Imperial)** — imperial catalogue. Currencies: USD, CAD (geo-picked).

The branch owns the locale. Every other tenant stays on a single system as today.

## What's wrong right now (verified)

- `resolve_product_options` reads master `product_catalog_links` and joins the master catalogue with **no unit filter**, so the Covers dropdown lists both `250gsm Silk` and `100lb Silk`. That is the mixed list in your screenshot.
- Currency is resolved **only from tenant settings**; `branch_settings` has no `regional` or `financial.default_currency_code` rows and the storefront never consults the branch. The Demo Centre tenant is set to `default_currency_code = GBP`, `multi_currency_enabled = true`, `lock_currency = false`, with all six currencies accepted — so the visitor falls through to geo detection, and when detection doesn't map cleanly it lands on the rest-of-world region (USD). That is why you saw US USD in Johannesburg.
- There is no Branch Settings UI for units or currency at all (tabs are Identity, Operations, Email, Users, Payments, Subscription).

## What gets built

### 1. Branch "Regional & Currency" tab (Branch Settings + platform/tenant branch detail)

New card writing to `branch_settings`:

- **Measurement system** — Metric (mm / gsm) or Imperial (in / lb). Absolute for that branch.
- **Default currency** and **Sellable currencies** (multi-select). Geo detection picks within the sellable list; anything outside falls back to the default.
- Read-only note showing which master catalogue the branch is therefore wired to.

Same card is reachable from Platform Admin → Tenant → Branch detail, so you can set it without logging into the branch.

### 2. Currency resolution becomes branch-first

`useRegionalPricing` gains a branch layer: branch `financial` settings (currency, accepted list) override the tenant's. Geo detection only ever selects a region whose currency is in the branch's sellable list; if the detected country isn't covered, the branch default is used — never the global USD rest-of-world region. The header picker only appears when the branch sells more than one currency, and any stale `dc_region_override` in localStorage pointing at a currency the branch doesn't sell is ignored.

### 3. Catalogue hard-filtered by branch unit system

`resolve_product_options` takes the branch's resolved unit system (`resolve_catalog_unit_system`) and filters sizes, papers and finishing to that `unit_system`. Print attributes stay shared. Master links authored in metric are translated to their imperial twin via the existing `catalog_unit_twin_code` helper, so an imperial branch shows `100lb Silk` where the metric branch shows `250gsm Silk`.

Storefront display (`useMeasurementUnit`) also resolves branch-first, so labels, sizes, bleed advisories and paper weights follow the branch rather than the tenant.

### 4. Demo data

- Existing **Demo Branch** → metric, default ZAR, sellable GBP/ZAR/AUD/NZD.
- New **Demo Branch USA & Canada** → imperial, default USD, sellable USD/CAD, cloned from the tenant catalogue against the imperial master list.

## Technical notes

- Migration: helper `resolve_branch_currency_policy`, and `resolve_product_options` rewritten to accept/derive the unit system and filter + twin-map item codes. Branch settings are plain `branch_settings` JSONB rows (`regional.measurement_unit`, `financial.default_currency_code`, `financial.accepted_currencies`), read through the existing SECURITY DEFINER resolvers so anonymous visitors can read them.
- Front end: `useRegionalPricing`, `useMeasurementUnit`, `useCatalogUnitSystem` all take `branchId` from `TenantContext`; new `BranchRegionalCard` component; NZD added to `platform_pricing_regions` and `pricing_currency_profiles` if missing.
- Pricing stays authored in the ZAR pivot and converted at display, unchanged.
