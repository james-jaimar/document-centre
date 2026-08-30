# Product image galleries with thumbnails

The storefront product page already supports multiple images: `ProductGallery` shows arrows and a thumbnail strip as soon as a family has 2+ images. The blocker is the admin side — the Imagery tab in Platform Admin → Storefronts only ever ends up with one image per product.

Confirmed from the database: for the Impress storefront, `tenant_settings.storefront.config.images` holds exactly **one** URL for A2 Deskpads, even after you added more. So the second upload is not being persisted. The exact mechanism is not yet proven (most likely a stale-state append in the Imagery tab — each upload builds the new array from a captured copy of the draft, so a second upload can replace rather than extend), so step 1 is to reproduce it in the browser and confirm before changing behaviour.

## What to build

### 1. Fix the append bug (first)
- Reproduce in the preview: upload two images to one family, watch the saved JSON.
- Rewrite the image list update to use a functional state update so every upload appends to the latest draft, never a captured snapshot.
- Support selecting several files at once (`multiple` on the file input) and upload them in sequence.

### 2. Proper gallery manager
- Extract the Imagery rows into a reusable `ProductGalleryManager`: larger thumbnails, per-image remove, drag or up/down reordering, and a clear "cover image" marker (first image = the card image on Shop and Home).
- Optional per-family "Save" affordance / dirty indicator so it's obvious the gallery has unsaved changes.
- Mount the same panel in the tenant admin product screen so tenants can manage their own product photos, not just platform admins.

### 3. Customer-facing gallery polish
- Thumbnail strip under the main image (already present for 2+ images); make it scroll horizontally on mobile.
- Click the main image to open a lightbox with next/previous and keyboard arrows.
- `aria-current` on the active thumb and alt text derived from the product name plus index.

## Technical notes
- Storage shape is unchanged: `images: Record<familyId, string[]>` inside the `storefront` / `config` row of `tenant_settings`.
- Files touched: `src/pages/platform/PlatformStorefrontDetail.tsx` (Imagery tab), new `src/components/admin/ProductGalleryManager.tsx`, `src/components/storefront/ProductGallery.tsx`, new `ProductLightbox.tsx`, plus the tenant product edit screen.
- Uploads keep using the existing `tenant-assets` storage path with a unique key per file.
