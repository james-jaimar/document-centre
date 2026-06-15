## Plan

1. **Restore the lost manual Covers list**
   - Repair the current Bound Documents → Covers row so `source = manual` contains the original manual values again: No Cover, clear/matte/frosted front cover combinations, card-stock covers, and printed cover variants.
   - Keep the preview metadata on every restored value so the customer preview can still render clear/matte/frosted/card/printed covers correctly.

2. **Stop manual values being overwritten again**
   - Add a persistent `manual_values` backup field to `product_options` (JSONB), so the admin can switch between `manual` and `catalog.*` without losing the hand-curated manual list.
   - When switching manual → catalog, save/retain the manual list in `manual_values` and show the catalog mirror separately.
   - When switching catalog → manual, restore from `manual_values` instead of showing a blank list or catalog rows.

3. **Update the admin product option editor**
   - Load `manual_values` when opening an option currently set to catalog.
   - On save:
     - `manual`: save restored/manual `values`, keep `manual_values` in sync.
     - `catalog.finishing`: save the catalog mirror in `values`, but preserve the manual list in `manual_values`.
   - Add defensive logic so a catalog mirror is never treated as the manual backup.

4. **Keep the customer configurator source-driven**
   - Leave customer reads strictly based on `product_options.source`.
   - `manual` uses saved `values`.
   - `catalog.finishing` uses saved product-enabled catalog rows plus master metadata.

5. **Validate with database reads**
   - Confirm Bound Documents → Covers has restored manual values after repair.
   - Confirm toggling source no longer destroys the manual list.
   - Confirm catalog mode still displays the catalog list with cover preview metadata.