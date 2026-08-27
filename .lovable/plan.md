# Upload finished artwork for editable products (Deskpads)

Editable-artwork families currently force every customer into the template editor. This adds a second, parallel route: upload a finished, pre-designed PDF, proof all 12 pages in the big viewer, approve, and add to cart.

## What the customer sees

1. **Product page** — under "Start designing" a secondary button, "Upload my own artwork". The shop card keeps its single primary action; the choice lives on the product page.
2. **Upload screen** — the same full-width, chromeless layout as the artwork editor: a drop zone (PDF only for this path), then the file's pages rendered as thumbnails down the side.
3. **Checks (hard block)** — after the PDF is read we compare against the product's published template geometry:
   - page count must equal the expected count (12 for deskpads)
   - trim size must match the deskpad trim (within a small tolerance for bleed/rounding)
   If either fails, the file is rejected with a plain-English message telling them what was expected versus what we found, and Add to cart stays disabled. They can remove the file and upload a corrected one.
4. **Proof** — a "Review all pages" button opens the existing near-full-screen proof modal. Same modal as the editor, showing the uploaded pages with arrow-key/next-prev paging and a JAN…DEC style label strip.
5. **Approve** — an "I have reviewed my artwork and approve it for print" tick, required before Add to cart, matching the editor's confirmation.
6. **Right column** — quantity, price summary and Add to cart, reusing the same pricing hook the editor uses so both routes price identically.

## Technical notes

- **Routing**: keep one builder entry but branch on a query flag, e.g. `orders/new/:familyId/custom-artwork?mode=upload` and `orders/:id/custom-artwork?mode=upload`. `OrderBuild`'s editable-artwork redirect and `NewOrder`/`startOrderPath` must preserve that flag so a reload or a lazily created order doesn't bounce the customer back into the template editor.
- **New component** `UploadedArtworkBuilder` (rendered by `TemplatedArtworkBuilder` when `mode=upload`, so layout/chrome and the order plumbing are shared). Reuses `rasterisePdfPages`, `ArtworkProofModal` (passing an empty placeholder set), the existing S3 upload/signed-URL flow, and `ensureOrder` lazy order creation.
- **Rasteriser**: `rasterisePdfPages` currently knocks white out to transparency for template bases. Add an opt-out so customer artwork renders opaque — transparency here would make a white-background deskpad look broken.
- **Geometry source**: expected page count and trim size come from the family's published `artwork_templates` row (`page_count`, `trim_width_mm`, `trim_height_mm`); trim detection on the upload uses the same TrimBox logic already in `pdfPages.ts`.
- **Order spec**: store as `order_items.spec.uploaded_artwork = { storage_path, file_name, page_count, trim_width_mm, trim_height_mm, approved_at }` — deliberately separate from `templated_artwork`, so downstream code can tell "customer-supplied print-ready" from "composed from template".
- **Print-ready**: no compose step. The uploaded PDF goes straight into the existing `enqueue-print-ready` / `production-pdf` path, so admin job screens and imposition work unchanged.
- **Admin visibility**: the job detail panel should show which route produced the artwork (template-composed vs customer-supplied) so production know whether a compose step ran.

## Out of scope

Pricing changes, mixing uploaded pages with template placeholders, and non-PDF uploads (images/Office) on this path.
