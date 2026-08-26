# Full-screen artwork editor layout + proof modal

Rework the customer templated-artwork builder so it runs as a dedicated full-width editor (no portal sidebar), matching the reference render, and add a large proof viewer.

## 1. Drop the sidebar on the editor route

`CustomerLayout` currently only hides the sidebar for storefront pages (landing/shop/product). Extend that same mechanism with an "editor" mode that also applies to `orders/new/:familyId/custom-artwork` and `orders/:id/custom-artwork`:

- Sidebar hidden, no collapsed rail, no `p-6 xl:p-8` padding — the page owns its own chrome.
- Tenant header stays (as in the render), footer stays.
- Mobile keeps the existing mobile layout behaviour.

## 2. Editor layout to match the render

Restructure `TemplatedArtworkBuilder` into a three-zone, full-height shell:

```text
[ sticky editor bar: Back | Product name | Saved state | Undo/Redo(placeholder) | Preview proof | Continue ]
[ left rail 300-340px ][      stage (flex, centred, fills height)      ][ summary 300-340px ]
[                       filmstrip of page thumbnails, month labels               ]
```

- Left rail: layout picker collapsed into a compact select when more than one template, then the placeholder panels (upload/replace, Fit/Fill, scale, position nudger, background colour swatches) in a single bordered card like the render.
- Stage: light grey backdrop, page canvas centred with square corners, size caption above (e.g. "A2 Deskpad Calendar (594 x 420 mm)"), optional safe-area/bleed guide toggles.
- Right: order summary card (product, quantity, unit price, subtotal, VAT, total, add to cart) plus the "artwork is locked except header" tip block.
- Filmstrip: horizontal thumbnails with page labels and prev/next arrows, active page outlined.
- Page uses the viewport height so everything fits without page-level scrolling; only the rails scroll.

## 3. Proof modal

New `ArtworkProofModal`:

- Opens from "Preview proof" in the editor bar and from a link in the summary card.
- Dialog sized to ~90vw x 90vh, dark backdrop, page rendered as large as fits.
- Prev/next buttons, arrow-key and Escape support, page counter ("Page 3 of 12"), thumbnail strip along the bottom for jumping.
- Renders the same composed pages already produced for the inline preview, so no extra rasterisation cost.
- Contains an "I have reviewed my artwork" acknowledgement that ties to the existing add-to-cart gating (optional checkbox, off by default until you confirm you want it enforced).

## Technical notes

- Files touched: `src/components/CustomerLayout.tsx` (chromeless route match), `src/pages/dashboard/TemplatedArtworkBuilder.tsx` (layout only), `src/components/artwork/PlaceholderPanel.tsx` (compact control styling), new `src/components/artwork/ArtworkProofModal.tsx`.
- No pricing, spec, upload or cart logic changes — presentation only.
- Colours/typography stay on existing tenant tokens; no hardcoded hex.

## On the CSS

No need to re-upload — the render plus the existing tenant tokens are enough. If you have exact spacing/type values from the UI kit you want honoured, send them and I will map them into the editor styles.
