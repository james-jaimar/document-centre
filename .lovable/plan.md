

# Use trim box for dimensions and thumbnail rendering

## Problem
The PDF server extracts all PDF boxes (media, trim, crop, bleed) and returns them in the `boxes` field of the asset. However:
1. The `width_pt` / `height_pt` reported on the asset use the **media box** — so documents with bleed show inflated dimensions (e.g. a document designed for A4 with 3mm bleed shows as 216×303mm instead of 210×297mm)
2. Thumbnails are rasterized from the media box, so they include bleed/slug areas that the end customer shouldn't see
3. The paper size detection then misidentifies the document (e.g. flags it as "non-ISO" when it's actually A4 + bleed)

## Approach

### Step 1: Probe the server's rasterize capability
Write a quick test to call the server and discover:
- Whether `v1/operations/rasterize` exists and what parameters it accepts
- What the `boxes` data actually looks like for an existing asset
- Whether `createAsset` accepts a `render_box` parameter

This test will be added to `supabase/functions/pdf-api/probe.test.ts` and run once to gather intelligence.

### Step 2: Use trim box dimensions client-side (immediate fix)
**File: `src/hooks/useDocumentUpload.ts`**

In `fetchThumbnails`, after getting the asset:
- Check `asset.boxes` for a `trim_box` or `TrimBox`
- If present, calculate `pageWidthMm` and `pageHeightMm` from the trim box instead of `width_pt`/`height_pt`
- This fixes the dimension display and paper size detection immediately, regardless of server thumbnail rendering

```text
Priority: trim_box → crop_box → media_box (width_pt/height_pt)
```

### Step 3: Pass render_box to createAsset or call rasterize separately
**Files: `src/lib/documentCentreApi.ts`, `src/hooks/useDocumentUpload.ts`**

Depending on what the probe reveals:
- **If createAsset accepts `render_box`**: Add it to `CreateAssetPayload` and pass `render_box: "trim"` (falling back to "media") when registering assets
- **If a separate rasterize operation is needed**: After the initial jobs complete and we have box data, call `v1/operations/rasterize` with the trim box specification, then poll for the new thumbnails
- **If the server doesn't support box-specific rendering yet**: Use the client-side dimension fix from Step 2 and document the server enhancement needed

### Step 4: Update the proxy allowlist if needed
**File: `supabase/functions/pdf-api/index.ts`**

If new paths are needed (e.g. `v1/operations/rasterize`), they're already covered by the `v1/operations` prefix.

## Technical detail

PDF box hierarchy:
```text
MediaBox  — full physical page (largest)
BleedBox  — printable area + bleed margin
TrimBox   — final trimmed page size (what the customer expects)
CropBox   — default rendering area in viewers
ArtBox    — meaningful content area (smallest)
```

For print workflows: TrimBox is the "real" page size. If no TrimBox exists, the document has no bleed and MediaBox = page size.

## Execution order
1. Run probe test to discover server capabilities
2. Apply client-side trim box dimension fix (works immediately)
3. Wire up server-side rendering if supported

