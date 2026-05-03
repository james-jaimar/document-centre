
# Housekeeping Fixes

## Issues and Fixes

### 1. Inline preview thumbnail uses hardcoded portrait aspect ratio
**File:** `src/pages/dashboard/OrderFiles.tsx` (line 2216)

The `InlinePreviewThumb` component hardcodes `aspect-[210/297]` (portrait A4). When the uploaded document is landscape (e.g., a poster image or business card at 90x50mm), the preview squashes it into portrait.

**Fix:** Use the document's `page_width_mm` and `page_height_mm` to compute a dynamic aspect ratio. Fall back to 210/297 only when dimensions are unavailable.

### 2. Posters showing "Front Cover" label in PreviewPanel
**File:** `src/components/order/PreviewPanel.tsx` (lines 57-63, 700-703)

The `SECTION_LABELS` map and the `pageInfoText` logic don't have product-aware overrides for posters/flyers. A poster's `front_cover` section should display as "Print" or "Poster", not "Front Cover".

**Fix:** Make the label resolution product-family-aware. When `productFamilySlug` is `posters`, map `front_cover` to "Poster". When it's `flyers`, map `front_cover`/`back_cover` to "Front"/"Back". Pass `productFamilySlug` into the label function.

### 3. Poster preview showing white border instead of edge-to-edge
**File:** `src/components/order/PreviewPanel.tsx` (bleed flags logic, line 573-589)

When a poster image fills edge-to-edge, the preview should show it without a white border. Currently the bleed logic only enables full bleed for specific product types (business cards, PVC covers).

**Fix:** For posters, default `bleedFlags` to `true` for all pages (same treatment as business cards) so the preview renders edge-to-edge.

### 4. Flyer auto-assign creating 4 pages instead of 2
**File:** `src/components/order/PreviewPanel.tsx` (line 178 in `buildPageSequence`)

When a 2-page document is auto-assigned as front + back (page_range 0-0 and 1-1), `buildPageSequence` ignores `page_range_start`/`page_range_end` and iterates ALL pages of the document per section, doubling the count to 4.

**Fix:** In `buildPageSequence`, use `section.page_range_start` and `section.page_range_end` to constrain the page iteration loop. When set, only iterate pages within that range rather than the full document.

### 5. Business cards showing "Front Cover / Body Pages / Back Cover" in SectionActions
**File:** `src/components/order/SectionActions.tsx`

The `getActions` function has no case for `business_cards` or `business-cards`, so it falls through to `BOUND_ACTIONS` which shows "Front Cover / Body Pages / Back Cover".

**Fix:** Add a `BUSINESS_CARD_ACTIONS` array with "Front" and "Back" labels (similar to flyers but without "optional"), and add slug matching in `getActions`.

### 6. Business cards configure step showing media box instead of trim box
**File:** `src/components/order/PreviewPanel.tsx` (line 591-598)

The `pageAspectRatio` and `pdfSizeMm` are derived from `page_width_mm`/`page_height_mm` on the document row. If these were set from the media box (full bleed area) rather than the trim box during upload, the configure preview will show a different crop than the upload preview.

**Fix:** When a document has `trim_box_pt` in its metadata, derive `page_width_mm`/`page_height_mm` from the trim box dimensions instead of the media box. This should be done during the upload finalization step so the document row always reflects the trim box dimensions for products that have one.

---

## Files to Modify

1. `src/pages/dashboard/OrderFiles.tsx` — Dynamic aspect ratio in `InlinePreviewThumb`
2. `src/components/order/PreviewPanel.tsx` — Product-aware labels, poster bleed, page range filtering in `buildPageSequence`
3. `src/components/order/SectionActions.tsx` — Business card section actions
