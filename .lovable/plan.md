

## Fix Minor Post-Upload Issues

### Issue 1: `v1/operations/rasterize` 404
The VPS does not have a standalone `/rasterize` endpoint. The code calls it at line 141 to get 150 DPI previews, but the initial `normalize_asset` job already generates previews, and `crop-rasterize` (which does exist) re-renders at 150 DPI when TrimBox differs. The call is redundant and produces a noisy console error.

**Fix**: Skip the standalone `rasterize()` call entirely. The `crop-rasterize` path already handles 150 DPI rendering when needed, and the default normalize job covers the rest.

**File**: `src/hooks/useDocumentUpload.ts` (lines 137-151)
- Remove the `rasterize()` call and its try/catch block
- Remove the `rasterize` import from `documentCentreApi`
- Adjust progress percentages to close the gap (48 -> 52 becomes seamless)

### Issue 2: `aria-describedby` warning on DialogContent
A `DialogContent` component is missing a `Description` element. This is a Radix UI accessibility warning.

**Fix**: Add a visually hidden `DialogDescription` to the upload progress modal or whichever dialog triggers during upload.

**File**: Likely `src/components/order/UploadProgressModal.tsx` or the save/confirm dialog — will verify and add `<DialogDescription className="sr-only">...</DialogDescription>`.

### Scope
- Two files changed, no VPS/edge function changes
- No functional impact — upload already works correctly

