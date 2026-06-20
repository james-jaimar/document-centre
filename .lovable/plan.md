
## Goal

Make the Photo Prints product behave like every other family: the customer's **Print Size**, **Finish** and **Border** dropdowns come from the Photo Prints product's `product_options` (which already point at the master catalogue rows you've toggled on), and the unit price comes from **Master Pricing → Photo Prints** (`rate_card_photo_prints`). No hard-coded sizes, finishes or labels in the customer page.

## Current state (verified)

- Product `photo-prints` already has three `product_options` rows:
  - **Print Size** — `source = catalog.sizes`, slugs `photo-4x6`, `photo-5x7`, `photo-6x8` enabled.
  - **Finish** — `source = catalog.papers`, photo papers enabled (`photo-gloss`, `photo-matt`).
  - **Border** — `source = manual`, slugs `none`, `white_3mm` with `metadata.border_mm` 0/3.
- Master Pricing rows in `rate_card_photo_prints` use the legacy short slugs (`4x6`/`5x7`/`6x8`, `gloss`/`matte`, `border_mm` 0/3) — these stay as the price source.
- `PhotoPrintsBuilder.tsx` currently imports `PHOTO_FINISH_OPTIONS`, `PHOTO_BORDER_OPTIONS` and `derivePhotoPrintSizesFromRateCard` and ignores `product_options` entirely.

## Approach

Add a thin "catalogue ↔ rate-card" mapping layer so the customer page reads from `product_options` (single source of truth for what's shown) but still prices from `rate_card_photo_prints` (single source of truth for prices). No DB schema changes, no migration of the existing rate-card rows.

### Slug bridge (deterministic, no new tables)

| Customer-facing option slug | Rate-card lookup key |
|---|---|
| Size `photo-4x6` / `photo-5x7` / `photo-6x8` | strip `photo-` → `4x6` / `5x7` / `6x8` |
| Finish `photo-gloss` (or any catalog paper whose finish=`gloss`) | `gloss` |
| Finish `photo-matt` / `photo-matte` (finish=`matt`/`silk`) | `matte` |
| Border `none` / `white_3mm` | `border_mm` from option metadata (0 / 3) |

The mapping lives in one small helper (`src/lib/photoPrints/catalogBridge.ts`) so future slugs only need one edit.

## Changes

### 1. New helper: `src/lib/photoPrints/catalogBridge.ts`
- `buildSizesFromOptions(printSizeOption, rateCardRows)` → `PhotoPrintSize[]`
  - Uses each enabled value's `metadata.width_mm` / `height_mm` and `label` from the catalogue (no `SIZE_METADATA` lookup needed).
  - Carries the rate-card lookup slug (`rcSizeSlug`) on each entry.
  - Indicative "from" price = lowest active rate-card price for that `rcSizeSlug`.
- `buildFinishesFromOptions(finishOption)` → `[{ slug, label, rcFinish, is_default }]`
  - `rcFinish` derived from the value's `metadata.finish` (`gloss`→`gloss`, `silk`/`matt`/`matte`→`matte`).
- `buildBordersFromOptions(borderOption)` → `[{ slug, label, border_mm, is_default }]`
  - Reads `metadata.border_mm` from the manual option (no hard-coded list).
- `resolvePhotoPrice({ rcSizeSlug, rcFinish, border_mm, quantity }, rateCardRows, priceBreaks)` — thin wrapper over the existing `resolvePhotoPrintPrice` that takes the bridged keys.

### 2. `src/pages/dashboard/PhotoPrintsBuilder.tsx`
- Replace `useResolvedProductOptions`-equivalent: use the existing `useCatalogBackedOptions(familyId, branchId)` (already used by Business Cards) to load the three option rows with master enrichment.
- Drive the three dropdowns from those rows (only `is_active !== false` values shown, `is_default` pre-selected).
- Remove imports/usage of `PHOTO_FINISH_OPTIONS`, `PHOTO_BORDER_OPTIONS`, `derivePhotoPrintSizesFromRateCard`.
- Pricing calls go through `resolvePhotoPrice` with bridged keys.

### 3. `src/lib/calculatePrice.ts` (photo-prints branch)
- Apply the same bridge: read catalog slugs from `opts["Print Size"]`/`opts["Finish"]`/`opts["Border"]`, translate to rate-card keys, then call the existing `resolvePhotoPrintPrice`. Keeps order totals consistent with the builder.

### 4. Auxiliary components
- `PhotoTile.tsx`, `PhotoEditorModal.tsx` currently import `PHOTO_BORDER_OPTIONS` only to look up `border_mm` by slug. Switch them to accept a `border_mm` prop (computed in the builder from the catalogue option) so they no longer depend on the hard-coded list.
- `getPhotoPrintSize` is kept as a fallback for historical specs (saved orders with old slugs like `4x6`); it can still read from `SIZE_METADATA` for those cases.

### 5. `src/lib/photoPrints/sizes.ts`
- Keep `getPhotoPrintSize` + `SIZE_METADATA` for back-compat with historical orders only.
- Mark `PHOTO_FINISH_OPTIONS`, `PHOTO_BORDER_OPTIONS`, `derivePhotoPrintSizesFromRateCard` as `@deprecated` and stop re-exporting them once nothing imports them. Removed in the same change since references are limited (builder + tiles + editor modal + rate-card editor).
- `RateCardEditor.tsx` keeps its own local `["gloss","matte","lustre"]` list (admin-only; that's fine — it's the price-row editor, not the customer surface).

## What the customer sees after the change

- Print Size dropdown shows exactly the sizes you toggled on in **Product → Catalogue** (`photo-4x6`, `photo-5x7`, `photo-6x8`), labelled from the master catalogue.
- Finish dropdown shows the photo papers you enabled in **Product → Options** (Gloss Photo, Matt Photo), with `photo-matt` priced as the rate-card `matte` row.
- Border dropdown shows the two values still configured on the manual Border option (admin can add more later by editing that option's values; no code change needed).
- Each selection prices against the matching row in **Master Pricing → Photo Prints** (or its branch override), so editing a price there immediately updates the customer page.

## Out of scope

- Moving Photo Print pricing onto `catalog_finishing_prices` / a new master table — kept on `rate_card_photo_prints` as you've already populated it.
- Per-quantity break tiers for photo prints — already supported by the existing `resolvePhotoPrintPrice` path and unchanged.
- Admin UI changes to the Photo Prints rate-card editor.
