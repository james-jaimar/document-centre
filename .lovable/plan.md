## Plan: fix A5 bleed/crop PDFs being scaled by MediaBox instead of TrimBox

### What the actual issue is

The current code still has two confirmed gaps that match what you are seeing:

1. **The frontend does not reliably enable `respect_trim_box` for exact ISO/A-series files with real TrimBox.**
   - On upload, `useDocumentUpload.ts` detects `TrimBox` vs `MediaBox`, but does not persist `trim_box_pt` / `has_bleed` into `preflight_data` for normal exact-size files.
   - Later, when `OrderFiles.tsx` scales A5 to A4, it decides `respectTrimBox` mostly from `preflight_data.near_iso_match`, `has_bleed`, or `trim_box_pt`.
   - So an A5 finished-size document with bleed/crop marks can still be sent to the server with `respect_trim_box=false`, causing the MediaBox path to run.

2. **Even when `respect_trim_box=true`, the server can deliberately fall back to MediaBox scaling if the PDF has a TrimBox but no explicit BleedBox.**
   - In `pdf-server/app/services/pdf_ops.py`, `resize_pages()` currently disables the trim-aware branch when `BleedBox` defaults to `MediaBox`.
   - Many real print PDFs have `MediaBox + TrimBox + crop marks`, but no explicit `BleedBox`.
   - That means the code sees the TrimBox, then rejects the trim-aware path and scales the whole MediaBox into A4 — exactly the symptom.

Do I know what the issue is? **Yes: the trim-aware branch is either not being requested by the frontend, or it is being requested but rejected by the server when BleedBox is absent/equal to MediaBox.** The screenshot alone cannot prove the uploaded PDF’s actual box values, but the code paths above are enough to explain the repeated behaviour.

### What I will change

#### 1. Make upload preflight remember real TrimBox/bleed metadata

In `src/hooks/useDocumentUpload.ts`:

- When `finalExplicitTrim` is true, persist:
  - `trim_box_pt: finalTrimBox`
  - `has_bleed: true`
  - refreshed `boxes`
- This makes exact A5/A4 PDFs with real print boxes behave the same as near-ISO bleed PDFs.

#### 2. Make scale-to-size inspect the actual backend asset boxes, not only stale document preflight

In `src/pages/dashboard/OrderFiles.tsx` inside `applyScaleTo()`:

- After `ensureFreshAsset()`, fetch the latest backend asset with `getAsset(workingAssetId)`.
- Detect `TrimBox` materially smaller than `MediaBox` directly from `asset.boxes`.
- Set `respectTrimBox=true` if either:
  - document preflight says it has bleed/trim, or
  - the current backend PDF actually has a real TrimBox.

This protects both new uploads and older documents whose preflight metadata was missing `trim_box_pt`.

#### 3. Fix server-side trim-aware resize fallback

In `pdf-server/app/services/pdf_ops.py` `resize_pages()`:

- Keep using the real `TrimBox` as the finished-page reference.
- If a valid `BleedBox` exists, use it.
- If `BleedBox` is absent or equal to `MediaBox`, **do not fall back to MediaBox scaling**.
- Instead synthesize a standard bleed box around TrimBox, clamped inside MediaBox, so crop marks outside that bleed region are clipped away.

Expected result:

```text
Source PDF:
MediaBox = trim + bleed/crop/canvas
TrimBox  = finished A5 page
BleedBox = maybe missing

Scale A5 → A4:
TrimBox  = finished A4 page
BleedBox = A4 + bleed
MediaBox = A4 + bleed
Old crop marks outside bleed are clipped
Artwork is scaled from TrimBox, not MediaBox
```

#### 4. Make CMYK box preservation universal

The recent fix restored boxes only inside `prepare_for_product()`. I will move/apply that protection at the `to_print_ready_cmyk()` level so every CMYK conversion path preserves `/TrimBox`, `/BleedBox`, `/CropBox`, and `/ArtBox`, including any older/direct `print-ready` call paths.

#### 5. Fix production assembly path too

In `pdf-server/app/tasks/production_tasks.py`:

- When production assembly resizes a job to the product target, pass `respect_trim_box=True` whenever the source PDF declares a real TrimBox / bleed geometry.
- This prevents the final production PDF from reintroducing the same MediaBox-scaling problem after the customer preview looked correct.

#### 6. Add a focused regression check

Add or update a small PDF-server regression script/test that creates two synthetic cases:

1. A5 TrimBox + MediaBox with crop marks, **no BleedBox**.
2. A5 TrimBox + explicit BleedBox + larger MediaBox.

For both, run A5 → A4 resize and verify:

- output TrimBox is A4 finished size,
- output MediaBox is not the old crop-mark canvas scaled into A4,
- TrimBox/BleedBox survive after CMYK/prepare,
- crop marks are clipped outside the visible prepared page.

### Validation after implementation

I will validate with code-level checks in the repo. After you pull to the VPS and re-upload the same 28-page file, the key signal should be:

- the scaling job payload includes `respect_trim_box: true`,
- the prepared PDF has `TrimBox` equal to finished A4,
- the prepared PDF’s `MediaBox` is A4 plus bleed, not the original crop-mark canvas scaled down,
- previews render the finished page edge instead of the crop-mark canvas.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>