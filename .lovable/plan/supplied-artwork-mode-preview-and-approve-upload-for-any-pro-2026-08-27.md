# Supplied-artwork mode: preview-and-approve upload for any product

Today only editable-artwork products (deskpads) get the new upload + proof screen. Everything else — Tent Calendar included — falls through to the legacy "Upload & Organise Files" builder. This adds an app-level switch so any product can use the new flow, with the expected size and page count entered by the admin instead of read from a published template.

## Admin (master product family)

A new block in the product family form, under the existing "Editable artwork product" switch:

- **Supplied artwork only** — when on, this product skips the old upload/section builder and uses the preview-and-approve screen. Customers upload one print-ready PDF, we render every page, check it, they approve, it goes to the cart.
- **Expected finished (trim) size** — width and height, in the family's unit (mm or inches, following the existing metric/imperial setting), with the usual ISO/US size presets to fill them in.
- **Expected number of pages** — leave blank to accept any page count.
- Short helper text explaining that both checks are hard blocks: a file that doesn't match is rejected with a message telling the customer what was expected and what we found.

These live on the product family, so they cascade to every tenant like the other family-level settings.

## Customer experience

For a product with the switch on (e.g. A4 Tent Calendar):

1. "Start order" goes straight to the supplied-artwork screen — no sections, no cover/body assignment, no template editor.
2. Drop a PDF. We rasterise every page from its TrimBox and show them as a thumbnail strip plus a large page view.
3. Checks run immediately:
   - page count must equal the expected count (when one is set)
   - trim size must match the expected size within 2 mm, portrait or landscape
   On failure the file is rejected with a plain-English message ("This product needs exactly 12 pages — your file has 10") and Add to cart stays disabled.
4. "Review all pages" opens the near-full-screen proof modal with arrow-key paging.
5. An "I have reviewed my artwork and approve it for print" tick is required.
6. Right column: quantity and price.

## Pricing

This route uses the normal pricing engine rather than the deskpad flat unit price:

- When the family has pack pricing blocks, quantity is a dropdown of the available pack quantities and the price comes from the matching block (branch override > tenant override > master), same resolution as the shop pages.
- When it has no pack blocks, quantity is a number field priced through the existing item-pricing rules.
- Currency and VAT display follow the existing regional/price-display hooks, so it matches the rest of the storefront.

## Technical notes

- **Schema**: add to `product_families` — `supplied_artwork_only boolean default false`, `expected_page_count int null`, `expected_trim_width_mm numeric null`, `expected_trim_height_mm numeric null`. Migration only; values stored in mm, converted for display when the family is imperial.
- **Routing**: `NewOrder.tsx` and `OrderBuild.tsx` currently branch on `supports_editable_artwork || kind === "templated_artwork"`. Add a third branch: `supplied_artwork_only` routes to `orders/new/:familyId/custom-artwork?mode=upload` (and `orders/:id/custom-artwork?mode=upload` on reopen), before the legacy builder is rendered. `startOrderPath` in `src/lib/storefront/catalogue.ts` gains the same branch so shop/product buttons point there.
- **Builder**: reuse `UploadedArtworkBuilder`. Its `reference` prop becomes a small geometry object (`{ page_count, trim_width_mm, trim_height_mm }`) built either from the published `artwork_templates` row (editable products, unchanged) or from the new family fields. Drop the "Design online instead" button when the family has no templates.
- **Pricing swap**: replace the `templated_unit_price` calculation in `UploadedArtworkBuilder` with resolved pack blocks (`resolvePackBlocks` + `product_pack_pricing_overrides`, as `useStorefrontCatalogue` does) and fall back to `useItemPricing` when there are no blocks.
- **Production**: unchanged — the PDF is stored in S3 and registered as a `documents` row, so print-ready and imposition treat it like any other supplied artwork.

## Out of scope

Multi-file uploads, per-section assignment, non-PDF uploads, and DPI/colour preflight on this route.
