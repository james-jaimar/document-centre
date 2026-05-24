## Two bugs in the "Scale to A4" flow

### Bug 1 — No feedback for ~60 s after clicking "Scale to A4"

In `src/pages/dashboard/OrderFiles.tsx` (`applyScaleTo`), the only UI feedback before the long server job is a small `toast.info("Scaling to A4…")`. The upload-progress modal (`setUploadModalOpen(true)`) is opened only **after** `pollJob(job_id)` returns — i.e. after the resize finishes. So during the slow CMYK → orient → resize round-trip on the pdf-server (≈ 60 s for a heavy A5 + bleed PDF), the user sees the dialog close and nothing else, and clicks repeatedly.

**Fix (frontend only):**

1. In `applyScaleTo`, immediately:
   - call `setUploadModalOpen(true)` before any server work,
   - push a synthetic upload entry via `useDocumentUpload` (e.g. expose `beginManualProgress(fileName, "Scaling to A4 — preparing file…")`) so the progress modal has a row with a spinner and indeterminate/low % value.
2. As we hit the server steps, update the progress text:
   - `"Preparing source PDF…"` (while `ensureFreshAsset` runs),
   - `"Scaling pages on server (this can take up to a minute)…"` (while `pollJob` runs; we already get `pending`/`running` events back — drive a slow trickle 30 → 80 %),
   - then hand off to existing `renderWithProgress` which goes 50 → 100.
3. Disable the "Keep / Scale" buttons in the advisory modal as soon as one is clicked (track `isApplying` state), so a second click can't fire.

Mirror the same early-open + trickle pattern in `applyKeepOriginal` for symmetry (it also calls `prepareForProduct`).

No backend changes for this bug.

### Bug 2 — Scaled file still contains bleed + crop marks at A4 size

`pdf_ops.resize_pages` in `pdf-server/app/services/pdf_ops.py` scales the **MediaBox** to the target. For an A5 PDF that ships with bleed (≈ 154 × 216 mm) plus crop marks in the MediaBox margin, the whole thing — bleed band and crop ticks — gets scaled up onto a single A4 sheet. The trim area ends up smaller than A4, and the crop marks become visible on the printable page.

The print-shop wants either (a) a clean A4 trim with no marks, or (b) a true A4 trim with proportional bleed and refreshed crop marks. Option (b) preserves the most professional workflow.

**Fix (backend, with a frontend hint):**

Extend `resize_pages` (and the `prepare_for_product` pipeline that wraps it) to be **trim-box aware**:

For each page, before scaling:

1. Read `TrimBox` (fall back to `CropBox`, then `MediaBox`). Call this `trim_src`.
2. Read `BleedBox` (fall back to `MediaBox`). Call this `bleed_src`.
3. Compute `bleed_margin_src = bleed_src − trim_src` (per-edge, in pt).
4. If `trim_src` ≈ `MediaBox` (no bleed declared), keep current behaviour — just scale MediaBox to target.
5. Otherwise:
   - Scale factor = `min(target_trim_w / trim_src_w, target_trim_h / trim_src_h)`.
   - New trim = target page size (e.g. A4).
   - New bleed margins = `bleed_margin_src × scale`.
   - New MediaBox = `target_trim + new_bleed_margin` on each side.
   - Place the **clipped** source page so its trim corners land exactly on the new trim corners; everything outside the new BleedBox is clipped away (this drops the old crop marks).
   - Write fresh `TrimBox`, `BleedBox`, and `MediaBox` on the output page.
6. After the loop, regenerate **crop marks** outside the new BleedBox using the existing `pdf_ops.impose_sheet_with_bleed`-style helper (factor out a small `draw_crop_marks(page, trim_rect)` routine). This means the operator's downstream tools see a real bleed-aware A4 PDF.

Edge cases:
- Page declares TrimBox but no BleedBox → assume 0 mm bleed, treat as "no bleed" (scale MediaBox, no new marks).
- TrimBox > MediaBox or invalid → fall back to MediaBox path.
- Different bleed per page → handled per-page, since we compute boxes per page.

**Frontend hint:** pass an explicit `respect_trim_box: true` flag from `prepareForProduct` and `resize` in `src/lib/documentCentreApi.ts` so the server can be opt-in until you've validated it across products. The advisory UI already knows whether the upload has bleed (`preflight_data.has_bleed`), so we send the flag only when bleed was detected.

## Files touched

Frontend:
- `src/pages/dashboard/OrderFiles.tsx` — early modal open + progress trickle in `applyScaleTo` / `applyKeepOriginal`; disable advisory buttons while applying.
- `src/hooks/useDocumentUpload.ts` — small `beginManualProgress(fileName, msg)` helper, or extend `renderWithProgress` to accept a `preStatus` so we can mount the modal row before render time.
- `src/lib/documentCentreApi.ts` — add `respect_trim_box?: boolean` to `prepareForProduct` and `resize` payloads.

Backend (pdf-server):
- `pdf-server/app/services/pdf_ops.py` — trim-box aware branch in `resize_pages`; new `draw_crop_marks(page, trim_rect, mark_length_mm, offset_mm)` helper.
- `pdf-server/app/schemas/assets.py` — add `respect_trim_box: bool = False` to `ResizeRequest` and `PrepareForProductRequest`.
- `pdf-server/app/web/routes.py`, `pdf-server/app/tasks/operation_tasks.py` — thread the new flag through to `pdf_ops.resize_pages` / `pdf_ops.prepare_for_product`.

## Test cases to verify

1. A4 colour duplex bound doc + A5 bleed/crops upload → "Scale to A4":
   - Progress modal opens within ~200 ms with "Scaling to A4 — preparing file…" status.
   - Status text trickles while the job runs; buttons in the advisory are disabled after the first click.
   - Resulting PDF: pages are true A4 trim, bleed band ~3 mm on all sides, crop marks just outside the bleed band; original A5 crop marks are gone; no content clipped at the trim edge.
2. Plain A5 (no bleed/crops) upload → "Scale to A4": behaves exactly as today (no trim-box branch triggered, no marks added).
3. A4 source already at target size: scale is a no-op visually; marks not re-added unless bleed declared.

## Out of scope
- Changing the long-running pdf-server pipeline into an async/`EdgeRuntime.waitUntil` pattern — current sync poll is fine once the user sees progress feedback. Revisit only if jobs routinely exceed 90 s.
- Touching tab/binding sizing logic from the previous turn.
