## Verified findings

- Pull Up Banners has two active linked variants: `economy` and `executive`; `executive` is currently the default.
- Demo2 branch has active branch prices for both variants on `pub-850x2000`: Economy `R 952.1739` ex VAT and Executive `R 1213.0435` ex VAT.
- The customer configurator writes the selected variant into `selected_options["Variant"]`, and the calculator reads that as `variant_code`.
- The confirmed bug is in the resolved rate-card merge: `useResolvedRateCard.ts` builds click-card natural keys from only `size | colour | sides`, so Economy and Executive rows with the same size/colour/sides collapse into one row before pricing. Because Executive is the later row, Economy disappears from the effective storefront rate card.
- I also found clone/sync database functions that still don’t consistently preserve `catalog_size_code`, which can reintroduce wrong fallback pricing for custom-size products like pull-up banners.

## Plan

1. **Fix the storefront resolved rate-card key**
   - Update click-rate merging to key by canonical size plus colour, sides, and `variant_code`.
   - Use `catalog_size_code` when present, falling back to `size`, so custom catalogue sizes and standard ISO sizes behave consistently.

2. **Tighten variant matching in the price calculator**
   - Keep exact variant matching first.
   - Only allow fallback to non-variant rows when there are genuinely no variant rows for that size/colour/sides, so selecting Economy cannot silently price from Executive or a generic row.
   - Make the breakdown label include the selected variant where applicable, so it is obvious which row priced the item.

3. **Repair database sync/clone paths**
   - Update `sync_master_rate_card_to_tenant` and `clone_tenant_pricing_to_branch` so they copy and match `catalog_size_code` as well as `variant_code`.
   - Rebuild the click-rate unique indexes around the same natural key the app uses: scope + canonical size + colour + sides + variant.
   - This prevents future “same displayed size, different catalogue code” collisions and avoids losing custom size codes during sync.

4. **Add a small regression check**
   - Add or update a targeted pricing test for two variant rows with identical size/colour/sides but different `variant_code`.
   - Assert Economy and Executive both remain in the resolved/effective rate card and price to different totals.

5. **Validate with real Demo2 data**
   - After implementation, verify the Demo2 pull-up banner customer flow shows Economy around `R 1,095` incl VAT and Executive around `R 1,395` incl VAT, matching the branch prices.