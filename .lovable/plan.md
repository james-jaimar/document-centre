

# Fix thumbnail rendering to use Trim Box

## Problem
The dimension detection is working correctly (210×297mm for the UICT profile). However, the **thumbnails still render from the MediaBox**, showing bleed and crop marks. The `render_box: "trim"` parameter sent to `createAsset` was silently ignored by the server — it's not a supported parameter on that endpoint.

## Solution: Call rasterize operation after initial processing

The server has a `v1/operations/rasterize` endpoint (confirmed by existing test). After the initial jobs complete and we have the asset's box data, we call rasterize with the TrimBox coordinates to generate new thumbnails cropped to the finished size.

## Changes

### 1. Probe the rasterize endpoint to discover its parameters
**File: `supabase/functions/pdf-api/index.test.ts`**
- Add a test that calls `v1/operations/rasterize` with the known UICT asset ID and TrimBox coordinates
- This tells us the exact parameter format the server expects
- Run once to gather the response

### 2. Add `rasterize` function to the API client
**File: `src/lib/documentCentreApi.ts`**
- Add a `rasterize()` function that calls `v1/operations/rasterize` with asset ID and box coordinates
- Parameters: `asset_id`, `box` (the [x0, y0, x1, y1] trim box coordinates), and optionally `dpi`

### 3. Re-rasterize after initial processing when TrimBox differs from MediaBox
**File: `src/hooks/useDocumentUpload.ts`**
- After initial jobs complete and we fetch the asset metadata, check if `TrimBox` exists and differs from `MediaBox`
- If so, call `rasterize()` with the TrimBox coordinates, poll the resulting job, then re-fetch derived files for the new thumbnails
- This replaces the media-box thumbnails with trim-box-cropped ones
- Update status text: "Cropping to trim size..."

### 4. Remove the unused `render_box` from `createAsset`
**File: `src/lib/documentCentreApi.ts`** and **`src/hooks/useDocumentUpload.ts`**
- Remove `render_box` from `CreateAssetPayload` since the server doesn't support it on that endpoint
- Clean up the parameter from the `createAsset` call

## Flow after fix

```text
Upload → createAsset(auto_queue) → poll jobs → fetch asset metadata
  ↓
  Has TrimBox ≠ MediaBox?
    YES → call rasterize(asset_id, trim_box) → poll job → fetch new thumbnails
    NO  → use existing thumbnails as-is
  ↓
  Save to documents table
```

## Execution order
1. Probe rasterize endpoint with test to learn parameter format
2. Add rasterize API function
3. Wire up the re-rasterize step in the upload flow
4. Clean up unused render_box parameter

