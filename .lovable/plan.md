## Problem

The uploaded poster (`KFC A1 4 Strips generic.pdf`) has all page boxes set in the PDF: MediaBox 634×880 mm, TrimBox 594×840 mm (A1) — i.e. 20 mm bleed per side. The order screen, however, shows the file as **634×880 mm** and never fires the bleed advisory. We expect it to recognize the TrimBox and treat the document as A1 + 20 mm bleed.

Two things are wrong, in this order:

### 1. Bleed advisory rejects poster-scale bleed

`src/lib/paperSizes.ts → detectNearIsoWithBleed` only considers bleed between **3 mm and 15 mm** per side. Poster bleeds are routinely 20–25 mm, so a 634×880 file vs A1 (594×841) is silently dropped. That's why no advisory ever appears.

### 2. TrimBox isn't being picked up for reporting

`useDocumentUpload.ts` already prefers `TrimBox → CropBox → MediaBox` for `page_width_mm`, so if `asset.boxes.TrimBox` were present we'd see 594×840 reported, not 634×880. The fact that we see the MediaBox dimensions means one of:

- the server-side asset analyzer is not extracting `TrimBox` into `asset.boxes` for this PDF, or
- the print-ready / orientation-normalize step is rewriting the PDF and dropping the TrimBox before we re-read `asset.boxes`.

We need to confirm which one, then fix it so `boxes.TrimBox` survives end-to-end.

## Changes

### A. Frontend — recognize poster-scale bleed (`src/lib/paperSizes.ts`)

- Add a poster-aware variant of `detectNearIsoWithBleed` that accepts `productFamilySlug`. When the family is a poster (reuse the existing `POSTER_FAMILY_SLUGS`), widen the bleed window to **3–30 mm** per side and restrict candidate ISO sizes to A2 / A1 / A0. Non-poster families keep the current 3–15 mm window across all A-sizes.
- Thread `productFamilySlug` through the call site in `src/hooks/useDocumentUpload.ts` (the upload hook already receives the slug via `productFamilySlug` param) so the near-ISO check uses the poster window for posters.

Effect: a 634×880 poster with no TrimBox at all would now correctly trigger the bleed advisory ("This is A1 with ~20 mm bleed — trim to 594×840?").

### B. Frontend — when TrimBox IS present, report trim dimensions (sanity check)

Add a one-line debug log right after `const finalBoxes = asset.boxes …` in `useDocumentUpload.ts` so we can immediately tell, from the browser console on the user's next upload, whether `finalBoxes.TrimBox` is populated. This decides whether C below is needed.

### C. Backend — make the asset analyzer always emit TrimBox (conditional)

If the console log from B shows TrimBox is **missing** for the user's KFC PDF, update the pdf-server asset analyzer (`pdf-server/app/services/assets.py` or equivalent — to be located when we're in build mode) so the `boxes` payload always includes `TrimBox`, `BleedBox`, `CropBox`, and `MediaBox` when present in the PDF, and so the print-ready / orientation-normalize pipeline preserves those boxes when it rewrites the PDF.

If B's log shows TrimBox IS present and we just aren't using it, the fix is purely frontend — re-read why the FileList row still renders MediaBox dimensions (likely a stale asset snapshot captured before `getAsset` re-fetch) and use the post-finalize `finalWidthMm`/`finalHeightMm` consistently.

### D. UI copy nit

`BleedAdvisory` currently rounds the bleed to a single average ("~20 mm"). For posters with 20×19.5 mm bleed this is fine, but make sure the dialog's example label reflects poster sizes (A1 / A2 / A0) when triggered — no separate change needed once A handles the slug.

## Out of scope

- No change to the size-lock UI or the lock value itself (the lock is already correctly A1 = 594×840).
- No change to bleed-handling on the production/print-ready side beyond preserving TrimBox.

## Verification

1. Re-upload `KFC A1 4 Strips generic.pdf` on a fresh Posters order.
2. Expect either (a) the file row to immediately read **594×840 mm** with a "TrimBox detected" indicator, or (b) the Bleed Advisory dialog to fire offering "Trim to A1 (594×840 mm) — ~20 mm bleed per side".
3. Re-upload a clean A1 PDF (594×841, no bleed) — no advisory, file reads 594×841, locked to A1.
4. Upload an A3 (no bleed) on the same Posters order — still allowed as a size-mismatch advisory, no false bleed prompt.
