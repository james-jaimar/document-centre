

## Photo Prints — new product family

A dedicated, dead-simple photo print product. Upload photos, pick a print size, drag/zoom each photo inside a fixed crop frame, set quantity per photo, add to cart. The backend renders one print-ready PDF per photo at the chosen size using the existing Document Centre API.

### What the customer experiences

1. Pick **Photo Prints** from the New Order grid (alongside Posters, Flyers, etc.)
2. Upload one or many JPG/PNG/WEBP/HEIC images (drag-drop or browse). Show thumbnail tiles immediately.
3. Pick a global **Print Size** (4×6, 5×7, 6×8, 8×10, A4) and **Finish** (Gloss / Matte) and optional **White Border** at the top of the page. Changing size re-applies aspect to all tiles (cropping is preserved if compatible, otherwise centre-fit reset).
4. Each photo tile shows: thumbnail in the print aspect, filename, low-res warning (if DPI < 150 at chosen size), quantity stepper, Edit, Duplicate, Remove.
5. Click **Edit** on a tile → modal opens with `react-easy-crop` showing the photo inside the fixed print frame. Controls: drag to reposition, zoom slider (1×–4×), Rotate 90°, Fit / Fill toggle, Reset, Save.
6. **Add to Cart** uses the existing cart confirmation flow. Each photo becomes one line in the order summary `Photo Print × N`. Total quantity = sum of all per-photo quantities.

### Why this approach

- Reuses every existing piece of infrastructure (orders, sections, documents, cart, checkout, pricing rules, PDF render). No parallel system.
- The crop editor stays cosmetic — we store `croppedAreaPixels` and let the backend cut the source image at full resolution when rendering the PDF. The browser never produces the production asset.
- New feature surface is contained in one product family + one editor component.

---

## Technical plan

### 1. Library

- Add **`react-easy-crop`** (lightweight, MIT, purpose-built for this exact UX). No `react-konva`, no Fabric.

### 2. New product family (DB seed only — no schema change)

Add a Photo Prints family via the existing `seedAllProducts.ts` mechanism so it appears automatically wherever product families are listed.

| Field | Value |
|---|---|
| slug | `photo-prints` |
| name | `Photo Prints` |
| icon | `Image` |
| sort_order | `9` |

Options (all stored in `product_options` like every other family):

- `Print Size`: `4x6 (102×152mm)`, `5x7 (127×178mm)`, `6x8 (152×203mm)`, `8x10 (203×254mm)`, `A4 (210×297mm)` — each value's `metadata` carries `width_mm`, `height_mm`, `aspect`.
- `Finish`: `Gloss` (default), `Matte`.
- `Border`: `None` (default), `White (3mm)`.

Pricing: a new `PRICING_PHOTO` set in `productOptionValues.ts` — per-print price by size, e.g. R3.50 (4×6), R5.50 (5×7), R8 (6×8), R12 (8×10), R15 (A4). Multiplied by per-photo quantity in `calculateItemPrice`.

### 3. Routing — dedicated photo flow, not the generic builder

When a user picks the Photo Prints family from `NewOrder.tsx`, route to a new dedicated page instead of `OrderFiles` → `OrderBuild`:

```
/t/:slug/orders/new/photo-prints      → PhotoPrintsBuilder (new)
/t/:slug/orders/:id/photo-prints      → PhotoPrintsBuilder (resume)
```

`NewOrder.tsx` checks `family.slug === "photo-prints"` and routes accordingly. All other families keep their current path.

### 4. New page: `PhotoPrintsBuilder`

Single-page workflow, mirroring the visual style of `OrderBuild` (compact, glassmorphic Customer portal aesthetic). Sections:

| Section | Purpose |
|---|---|
| Top toolbar | Print Size, Finish, Border, total cost summary |
| Upload dropzone | `FileUploader`-style component, accepts `image/jpeg, image/png, image/webp, image/heic` |
| Photo grid | Tiles with thumbnail (clipped to chosen aspect), filename, qty stepper, Edit / Duplicate / Remove, low-res warning badge |
| Photo editor modal | `react-easy-crop` with zoom slider, Rotate 90°, Fit/Fill, Save |
| Bottom bar | Total photos, total prints, total price, **Add to Cart** |

### 5. Data model — reuse existing tables, no migration

For a Photo Prints order, each uploaded photo maps to:

- One `documents` row holding the **original** uploaded image (stored in the `document-uploads` bucket like every other upload).
- One `document_sections` row with `section_type = "body"`, `sort_order` = grid position.
- A new JSONB blob on `order_items.spec` describing the photo job:

```ts
spec.photo_prints = [
  {
    document_id: "...",
    file_name: "IMG_1234.jpg",
    original_storage_path: "...",
    print_size_slug: "5x7",
    crop: { x: 0, y: 0 },          // react-easy-crop crop position
    zoom: 1,
    rotation: 0,
    croppedAreaPixels: { x, y, width, height },  // pixel rect on source
    fit_mode: "fill",
    quantity: 4,
  },
  ...
]
```

This keeps the schema unchanged and lets `buildJobSnapshot.ts` produce a per-photo line in the job summary by reading `spec.photo_prints`.

`order_items.quantity` = sum of per-photo quantities (so existing total-page / quantity logic still works for invoicing).

### 6. Upload pipeline

- Reuse `useDocumentUpload` for the underlying S3 upload — but skip the PDF preflight steps. Photos do not need PDF normalisation.
- Add a thin `usePhotoUpload` hook (or a `mode: "photo"` branch on `useDocumentUpload`) that:
  1. Uploads original image to `document-uploads/<orderItem>/photos/<filename>`.
  2. Creates a `documents` row with `mime_type` set to the actual image type and `page_count = 1`.
  3. Stores `page_width_mm`/`page_height_mm` derived from the image's pixel dimensions at 72 DPI (used only for low-res warning).
  4. Generates a thumbnail client-side (canvas → small JPEG) and uploads it as the document thumbnail so the grid tile displays instantly.
- HEIC images: best handled server-side. For v1, accept HEIC but show a "Converting…" state and let the Document Centre API normalise to JPEG (a small `v1/operations/normalize-image` extension may be needed; if not in scope, restrict v1 to JPG/PNG/WEBP and surface a clear message for HEIC).

### 7. Add to Cart → render print-ready PDFs

When the user confirms Add to Cart, server-side rendering happens through the existing edge function path. For each photo entry:

1. Create a Document Centre asset from the original image (`createAsset` with the image storage path) — this already supports any media type.
2. Call `cropRasterize(assetId, box, dpi=300)` where `box` is derived from `croppedAreaPixels` (already in source-pixel units). DPI 300 for print quality.
3. Call `resize(assetId, widthMm, heightMm, fitMode="fill")` so the cropped image lands on a page exactly matching the chosen print size. Apply white-border padding via `fit` mode if Border = White.
4. Apply rotation if any (`rotate`).
5. The resulting derived PDF is stored under `order_documents` as a print-ready file (`document_type = "print_ready"`, `is_customer_visible = false`), one per photo.
6. Quantity carries through to the production job — printer prints `qty` copies of that PDF. (Optional v1.1: `imposeSheet` to gang-up many prints onto one larger press sheet.)

This work runs as a `usePhotoRenderQueue` hook the moment the user confirms Add to Cart, with the existing `UploadProgressModal` repurposed to show a "Preparing prints…" progress bar. Add to Cart only completes once every print PDF is rendered and recorded.

### 8. Pricing

Use the existing `pricing_rules` engine. Photo print pricing rule = per-unit, conditioned on `Print Size` value slug. `calculateItemPrice` already supports `per_unit` rules and `selected_options` matching. The total quantity = sum of per-photo quantities, so a single `per_unit` rule × quantity gives the right total.

Per-photo line breakdown for the cart confirmation comes from iterating `spec.photo_prints` client-side and computing `qty × per_unit_for(size)`.

### 9. Preview / order detail

`buildJobSnapshot.ts` extended: when the family is `photo-prints`, emit a `Photos` config section that lists one row per photo (filename thumbnail, size, qty, subtotal). `JobDetailPanel` already renders config sections without modification.

### 10. Constraints & guardrails

- Do not touch `FlipBook`, `RingBinderOpenSpread`, or any bound-document preview code.
- Do not run the bound-document preview pipeline for photo orders. The photo grid IS the preview.
- Max 50 MB per file (existing constraint).
- Low-res warning: if the cropped pixel area produces < 150 DPI at the chosen print size, show a yellow badge on the tile.
- Cart confirmation modal stays the same (Reference + Add to Cart).

---

## Files to create

| File | Purpose |
|---|---|
| `src/pages/dashboard/PhotoPrintsBuilder.tsx` | The whole photo flow — toolbar, upload, grid, editor modal, cart bar |
| `src/components/photo/PhotoTile.tsx` | One grid tile (thumbnail, badges, qty, actions) |
| `src/components/photo/PhotoEditorModal.tsx` | `react-easy-crop` editor with zoom/rotate/fit controls |
| `src/components/photo/PhotoUploader.tsx` | Image-only dropzone (wraps `FileUploader` with image MIME filter) |
| `src/hooks/usePhotoUpload.ts` | Image upload → `documents` row, no PDF preflight |
| `src/hooks/usePhotoRenderQueue.ts` | On Add to Cart: createAsset → cropRasterize → resize per photo |
| `src/lib/photoPrints/sizes.ts` | Print size catalogue with `aspect`, `width_mm`, `height_mm` |
| `src/lib/photoPrints/types.ts` | `PhotoPrintEntry`, `PhotoPrintsSpec` types |

## Files to update

| File | Change |
|---|---|
| `src/lib/seedAllProducts.ts` | Add `seedPhotoPrints()` and include in `seedAllProducts` |
| `src/lib/productOptionValues.ts` | Add `PRINT_SIZE_PHOTO`, `PHOTO_FINISH`, `PHOTO_BORDER`, `PRICING_PHOTO` |
| `src/pages/dashboard/NewOrder.tsx` | Route Photo Prints family to `/t/:slug/orders/new/photo-prints` instead of generic builder |
| `src/App.tsx` | Add the two new routes for `PhotoPrintsBuilder` |
| `src/lib/orders/buildJobSnapshot.ts` | Emit a `Photos` config section when family slug is `photo-prints` |
| `package.json` | Add `react-easy-crop` |

## Verification checklist

1. New family **Photo Prints** appears on the New Order page with the existing card style.
2. Selecting it opens the photo flow, never the generic OrderBuild.
3. Multi-image upload populates the grid instantly with correct aspect-clipped thumbnails.
4. Changing Print Size re-aspects every tile, preserves crop where possible.
5. Editor modal lets the user drag, zoom (1×–4×), rotate 90°, toggle Fit/Fill, Save.
6. Per-photo quantity stepper updates the bottom-bar total live.
7. Low-res warning appears when a 4 MP photo is cropped to fit A4.
8. Add to Cart renders one print-ready PDF per photo in the background, then enters the cart.
9. Cart line-item shows `Photo Prints × N (n photos)` with a per-photo breakdown in order detail.
10. Existing bound documents, ring binders, brochures, etc. behave exactly as before — no regressions.

