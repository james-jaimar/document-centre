## Bug

Pull Up Banners at Demo2 branch shows **R5.75 incl VAT** instead of the branch variant price (~R1,213 ex VAT / R1,395 incl VAT for Executive).

## Root cause (verified against the DB)

1. `product_families` row `pull-up-banners` has **zero `product_options` rows**, but does have `product_catalog_links` for size `pub-850x2000`.
2. Because there is no "Document Size" option row, `useCatalogBackedOptions` has nothing to enrich — the customer configurator never sets `spec.selected_options["Document Size"]`.
3. In `calculatePrice.ts`, when no size is selected the engine **defaults to `"A4"`** (line 532). It then resolves an A4 colour/simplex click charge — that is where the ~R5 unit price comes from.
4. Even if the size were selected, `resolveClickRate` / `resolvePaper` match on `c.size` (which stores the human label `"Pull up banner"`), not `catalog_size_code` (`pub-850x2000`) — so the actual variant rows for `pub-850x2000` would still never match a finished size code of `PUB-850X2000`.

## Fix

### 1. `src/lib/calculatePrice.ts`
- In `resolveClickRate` and `resolvePaper`, match rows by **`catalog_size_code` first** (case-insensitive), falling back to `size` label — so rows keyed to catalog codes like `pub-850x2000` resolve correctly.
- Keep A4 as the fallback only when the product has no linked sizes at all; when the spec carries a size (from a synthesised or user-chosen Document Size), use it verbatim.

### 2. `src/pages/dashboard/OrderBuild.tsx`
- When the family has `product_catalog_links` of catalog=`size` but no `Document Size` product option (large-format / custom products), auto-seed `spec.selected_options["Document Size"]` with the first linked size code on mount — so the pricing engine receives `pub-850x2000` instead of falling back to `A4`.
- If exactly one size is linked, do not render a Size selector (nothing to choose); if multiple, the existing option flow still applies once an option row exists.

### 3. Sanity check the Variant wiring
- Confirm `spec.selected_options["Variant"]` (already defaulting to `executive` in the screenshot) is passed through to `resolveClickRate` — no change expected, just verify.

## Verification

- Reload the Pull Up Banners configurator at Demo2 → the unit price should switch from **R5.75** to **~R1,395 incl VAT (Executive)** / **~R1,095 incl VAT (Economy)**.
- Switching the Variant dropdown must flip the price between the two.
- Existing A-sized products (flyers, booklets, etc.) must remain unchanged — the resolver still matches by catalog_size_code / size label so A4/A3 rows continue to resolve.
