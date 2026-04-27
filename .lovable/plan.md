## Problem

For a Bound Document upload that is mostly portrait but contains a landscape page (e.g. a Word doc with a landscape table mid-document), the landscape page is currently shown as a portrait sheet with the landscape content shrunk/oriented sideways inside it.

The user is right that this used to work: landscape pages inside a portrait-required product were auto-rotated 90° clockwise so they sat upright on a portrait sheet (the canonical "landscape page in a portrait book" layout you see in printed reports).

## Root cause

The orientation pipeline currently has two layers:

1. **Whole-document advisory** (`useDocumentUpload.ts` → `detectOrientationMismatch`) — fires only when *the document* (page 1 dims) violates the product's required orientation. A bound document whose page 1 is portrait passes this check, so no advisory is shown and no rotation is performed.

2. **Per-page rotation** (`pdf_ops.normalize_orientation`) — exists in the PDF server and CAN rotate non-conforming pages to a dominant orientation. But it is only invoked from the user-facing OrientationAdvisory dialog (which never fires for our case).

The result: per-page normalisation is never run for mixed-orientation docs that don't trip the whole-doc advisory. Ghostscript honours `/Rotate` and renders the page landscape, but downstream the FlipBook is fixed to page-1's portrait aspect, so the landscape thumbnail is shown squashed/sideways.

This regressed when the upload pipeline was simplified to "preserve the customer's authored orientation; explicit rotation only happens when the user accepts the OrientationAdvisory" (see comment block in `useDocumentUpload.ts:30-42` and `:365-368`). That rule is correct for *whole-document* orientation but is being applied to *per-page* orientation too, which is wrong for portrait-required products with mixed pages.

## Fix

Re-introduce automatic per-page normalisation (only) for products that have a required orientation, run automatically as part of the upload pipeline (no user prompt — same behaviour as before).

### Changes

**Backend — `pdf-server/app/services/pdf_ops.py`**

No code changes needed. `normalize_orientation(src, out, dominant=...)` already does exactly what we need:
- Bakes any `/Rotate` hint into content (so LibreOffice landscape pages are correctly identified)
- Composites pages whose visual orientation differs from `dominant` onto a +90°-rotated swapped-dimensions canvas
- Carries TrimBox/BleedBox/CropBox/ArtBox through the rotation
- Returns `{ pages_rotated, total_pages, skipped }`

**Backend — `pdf-server/app/web/routes.py` / `pdf-server/app/tasks/operation_tasks.py`**

Verify the existing `normalize-orientation` operation accepts a `target` (portrait | landscape) parameter — this endpoint is already used by `documentCentreApi.normalizeOrientation`. No change expected, but will confirm.

**Frontend — `src/hooks/useDocumentUpload.ts`**

In `inspectExistingAsset` (after `inspectAsset` completes, before rendering thumbnails), add a new step:

1. If the product family has a `requiredOrientation` (portrait or landscape), AND the asset has more than one page, run `normalizeOrientation(assetId, requiredOrientation)` automatically. This is silent — no UI prompt.
2. Wait for the job to complete with `pollJob`.
3. Re-fetch the asset (`getAsset`) so subsequent dimension/box reads reflect the rotated PDF.
4. Persist a `preflight.orientation_normalized = true` flag so we never re-run it on the same asset.

This sits *between* the existing inspect step and the per-document advisory check. The whole-doc OrientationAdvisory still works exactly as today (rare case where page 1 itself violates the policy), but per-page mismatches are now silently corrected first — exactly the prior working behaviour.

**Frontend — comment cleanup**

Update the policy comment block at the top of `useDocumentUpload.ts` (lines 30-42) and the `finalizeOrientationAndPrintReady` doc comment (lines 365-368) so future readers understand:
- *Whole-document* orientation is still owned by the customer and gated by the advisory.
- *Per-page* mismatches inside a product with a required orientation are silently normalised at upload time.

### Files touched

- `src/hooks/useDocumentUpload.ts` — new auto-normalisation step + comment update.
- (Verification only) `pdf-server/app/web/routes.py`, `pdf-server/app/tasks/operation_tasks.py` — confirm the `normalize-orientation` endpoint passes `target` through to `pdf_ops.normalize_orientation`.

### Out of scope

- No changes to the FlipBook / PreviewPanel — once the underlying PDF has uniform orientation, the existing preview renders landscape inserts correctly.
- No changes to the OrientationAdvisory dialog — whole-document mismatch UX is unchanged.
- Image uploads (single image → one PDF page) are unaffected; they only have one page so per-page normalisation is a no-op.
