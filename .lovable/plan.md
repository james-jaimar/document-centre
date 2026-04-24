## Goal

On the customer-facing order detail page (`/t/:slug/orders/:id`), show the same little photo thumbnails (with size, quantity badge, finish/border summary) that admins already see, so customers can visually confirm what they ordered.

## Approach

The existing `PhotoPrintsAdminGallery` component is already:
- Self-contained — takes only `photoPrints` (the `configuration.photo_prints` JSON).
- Read-only — no admin-only mutations or controls.
- Fail-open — shows signed originals immediately, layers cropped previews on top if/when canvas rendering succeeds, and falls back to "Preview unavailable" cleanly.
- Compact and styled with neutral tokens that fit the customer portal.

So this is a small, surgical change — no new components, no new data fetching, no edge function work.

## Changes

**`src/pages/dashboard/CustomerOrderDetail.tsx`**

Inside the existing per-job loop in the "Items" card, when `config.photo_prints` exists (or `job.product_category === "photo-prints"`), render `<PhotoPrintsAdminGallery photoPrints={config.photo_prints} />` underneath the spec chips / sections block. This mirrors exactly what `JobDetailPanel.tsx` does on the admin side.

Add the import for `PhotoPrintsAdminGallery` at the top of the file.

That's it — RLS already permits the customer to read their own `orders` / `order_jobs` / signed S3 URLs for their uploaded originals, so the gallery will render the same thumbnails they cropped at checkout.

## Out of scope

- No changes to the admin gallery, edge functions, hooks, or photo render pipeline.
- No changes to `CustomerOrders.tsx` list view (the request is about seeing what they ordered, which lives on the detail page).

## Verification

1. Open a placed photo-prints order as the customer at `/t/:slug/orders/:id`.
2. Confirm the "Items" card now shows a small grid of photo tiles with `×qty` badges, size label, and the summary line ("N photos · M prints · 4×6 · gloss").
3. Confirm the same order viewed by the admin still looks identical (no regression — same component, same props).
