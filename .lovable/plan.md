# Product image galleries with thumbnails

The storefront product page already supports multiple images with a thumbnail strip — `ProductGallery` renders arrows and thumbnails as soon as a product has more than one image. A2 Deskpads currently shows one image because only one image is stored for that family, and the only place to upload extras today is Platform Admin → Storefronts → (tenant) → Imagery. That screen is platform-only and is a flat "Add" button with no ordering or captions.

So the work is: make gallery uploads easy to reach for tenant/branch admins, and polish the customer-facing gallery.

## What to build

### 1. Gallery manager for tenant admins
- New reusable panel `ProductGalleryManager` (extracted from the Imagery tab in `PlatformStorefrontDetail`): per-family list of images with upload, remove, drag-to-reorder, and a "cover image" marker (first image = card image on Shop/Home).
- Mount it in the tenant admin product area (Admin → Products → edit family → "Storefront images" section) so a tenant can manage their own product photos, and reuse the same panel in the existing platform Imagery tab.
- Storage stays as-is: `storefront_pages.images` keyed by family id (array of URLs), uploaded through the existing image upload/S3 path.

### 2. Better customer gallery
- Always show the thumbnail strip when 2+ images exist; keep the current single-image behaviour otherwise.
- Thumbnail strip scrolls horizontally on mobile, sits under the main image on desktop.
- Click main image to open a lightbox with next/previous and keyboard arrows.
- Keyboard/ARIA: arrow-key navigation, `aria-current` on the active thumb, alt text derived from the product name plus index.

### 3. Fallback behaviour (unchanged)
- No uploaded images → built-in slug image is used, no thumbnail strip.

## Technical notes
- `src/components/storefront/ProductGallery.tsx` — thumbnail strip + lightbox + keyboard handling.
- `src/components/storefront/` new `ProductLightbox.tsx`.
- New `src/components/admin/ProductGalleryManager.tsx`; used by `PlatformStorefrontDetail.tsx` (Imagery tab) and the tenant product edit screen.
- Reordering via simple up/down or drag handles writing back the ordered URL array into `storefront_pages.images[familyId]`.
- No schema change: `images: Record<string, string[]>` already exists in `useStorefrontPages`.
