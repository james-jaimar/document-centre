

# Fix Preview Type Detection + Clean Up Old Preview System

## Root Cause

The product family slug is `"bound-documents"` — a single family covering all binding types. The `SLUG_TO_PREVIEW` mapping in `OrderBuild.tsx` has no entry for this slug, so it always falls through to `"loose_sheets"`. The binding type (comb, spiral, wire, ring binder) is selected as a **product option**, not a product family.

## Solution

### 1. Derive preview type from the selected binding option (`OrderBuild.tsx`)

Instead of mapping only from the product family slug, also inspect `spec.selected_options.Binding` to extract the `binding_method` metadata from the matching option value. The seed data stores `binding_method` in each binding option's metadata (e.g., `"comb"`, `"spiral"`, `"twin_loop"`, `"ring_binder"`).

Logic:
- Find the "Binding" option from the `options` array
- Look up the selected slug in `spec.selected_options["Binding"]`
- Read its `metadata.binding_method`
- Map: `comb` → `"comb_bound"`, `spiral` → `"wire_bound"`, `twin_loop` → `"wire_bound"`, `ring_binder` → `"ring_binder"`
- Fall back to the existing slug-based mapping for fold/leaflet product families

### 2. Remove old `DocumentPreviewThumb` component

Delete `src/components/order/DocumentPreviewThumb.tsx` and replace its usage in `OrderFiles.tsx` with a small inline thumbnail that uses the existing `batchSignUrls`/`useSignedThumbnailUrl` from thumbnailUtils. The middle column preview in OrderFiles (Step 1) is just a single cover thumbnail — it doesn't need the full preview system, just a signed image.

### 3. Remove stale `useSignedThumbnailUrl` usages that bypass the cache

`DocumentPreviewThumb.tsx` and `FileList.tsx` each call `useSignedThumbnailUrl` per-image (individual signed URL calls). These should use the batch cache instead, but since `DocumentPreviewThumb` is being deleted, only `FileList.tsx` needs updating — and its thumbnails are tiny list items, so the per-item hook is acceptable there.

## Files to change

1. **`src/pages/dashboard/OrderBuild.tsx`** — Add binding-method-based preview type derivation
2. **`src/pages/dashboard/OrderFiles.tsx`** — Replace `DocumentPreviewThumb` import with inline thumbnail using `useSignedThumbnailUrl`
3. **`src/components/order/DocumentPreviewThumb.tsx`** — Delete this file

## What stays the same

- All preview components (`FlipBook`, `FoldPreview`, `LooseSheetsPreview`, `DocumentPreview`) — unchanged
- `PreviewPanel` and `PreviewLightbox` — unchanged
- `thumbnailUtils.ts` — unchanged

