## Photo Prints — make sizes 100% rate-card driven

**Root cause.** Photo print sizes are defined in three duplicated places, and only one of them (the Rate Card) is what you actually edit:

1. **Rate Card** (`rate_card_photo_prints`) — source of truth, what you edit on the Pricing page. You've removed A4 from master and the demo tenant rate card is also clean.
2. **Hardcoded catalogue** `src/lib/photoPrints/sizes.ts` — `PHOTO_PRINT_SIZES` still lists `4x6, 5x7, 6x8, 8x10, a4`. The customer Photo Prints builder iterates this list, so A4 still appears in the size dropdown even though no rate exists for it. (No `8x12` is hardcoded — it isn't in the catalogue or DB anywhere; safe to ignore.)
3. **Master `pricing_rules` + `product_options`** for the `photo-prints` family — still contain `A4 Photo Print` rules and an `a4` value in the Print Size group. This is what the Demo tenant Products → Pricing modal is showing as "hard coded A4".

The Photo Prints family is fully priced by the rate card; the per-family `pricing_rules` and the `Print Size` option values are dead duplicates that just leak old sizes into the UI.

### Fix

**1. Drive sizes from the rate card.** Replace the hardcoded `PHOTO_PRINT_SIZES` with a derivation from the active rate card rows for the current tenant (falling back to master if the tenant has none):

- New helper `derivePhotoPrintSizesFromRateCard(rows)` returns one `PhotoPrintSize` per distinct active `size_slug`, computing dimensions/aspect/DPI thresholds from a small static metadata map (`SIZE_METADATA`) keyed by slug — `4x6`, `5x7`, `6x8`, `8x10`, `a4`, `a3`, etc. The metadata map only carries physical dimensions; whether a size is *offered* is decided by the rate card alone.
- `PhotoPrintsBuilder.tsx` uses this derived list for the Size dropdown and for `getPhotoPrintSize(...)` lookups.
- If the current `photoSpec.print_size_slug` is no longer in the rate card (e.g. customer had A4 selected before it was removed), auto-switch to the first available size and toast a notice.
- `DEFAULT_PHOTO_PRINT_SIZE_SLUG` becomes "first active rate-card size, else `4x6`".

**2. Hide rate-card-managed families from the generic pricing UI.**

- In the Demo tenant **Products → Photo Prints → Pricing** modal (`ProductPricingModal` or similar — opened from `AdminProducts`), detect that `photo-prints` is rate-card-driven and replace the "Base Pricing Rules" block with a read-only message: *"Photo Print prices are managed on the Rate Card → Photo Prints tab."* with a deep link. Keep "Combination Overrides" and "Option Surcharges" sections intact (they remain valid for non-price options like Border).
- Same treatment on `AdminPricing` (master): hide / filter out pricing rules whose family is rate-card-driven, with the same message.

**3. Clean up the stale data.** A migration that:

- Removes the `a4` value from the `Print Size` `product_options` row for `photo-prints` (master + any tenant copies).
- Deletes all rows in `pricing_rules` where the family slug is `photo-prints` (both master and tenant copies). The rate card is the only price source for this family.

No schema changes — purely a data cleanup INSERT/DELETE migration.

### Files touched

- `src/lib/photoPrints/sizes.ts` — keep `SIZE_METADATA` map, drop hardcoded `PHOTO_PRINT_SIZES` list, add `derivePhotoPrintSizesFromRateCard`.
- `src/lib/photoPrints/pricing.ts` — minor: drop the static fallback (rate card is required now).
- `src/pages/dashboard/PhotoPrintsBuilder.tsx` — derive sizes from rate card, auto-correct stale selection.
- `src/components/photo/PhotoTile.tsx`, `PhotoEditorModal.tsx` — pass rate-card-derived sizes via prop or context lookup instead of `getPhotoPrintSize` against the static list.
- `src/pages/admin/AdminProducts.tsx` (the Pricing modal) and `src/pages/admin/AdminPricing.tsx` / `PlatformMasterPricing.tsx` — show "managed by rate card" banner and hide the per-size rule rows for `photo-prints`.
- New migration: clean A4 product option value + delete `photo-prints` pricing_rules rows.

### Outcome

- Removing a size from the Rate Card immediately removes it from the customer Photo Prints builder and from any admin pricing UI.
- No more orphaned "A4" anywhere in the demo tenant.
- Future sizes (e.g. `8x12`) are added by inserting a rate-card row + a one-line entry in `SIZE_METADATA`; nothing else hardcodes the catalogue.
