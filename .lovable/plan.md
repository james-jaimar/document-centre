# Restore TrimBox preview cropping & purge CSS binding fallbacks

Two unrelated regressions to fix together:

1. Previews are rendering the full **MediaBox** (with bleed/crop marks visible) instead of cropping to the **TrimBox** the PDF declares.
2. `BindingSpine.tsx` still contains a CSS gradient fallback that paints fake spirals/wires when an image isn't available. Every supported binding/colour/edge combo already has artwork in `bindingAssets.ts` — there must be no CSS art rendered, ever.

---

## 1. TrimBox-aware previews (backend)

**Where it broke**: `pdf-server/app/tasks/document_tasks.py` triggers `generate_previews.delay(asset_id, preview_job_id)` after upload **without a `render_box`**. The task supports a `render_box` argument and `pdf_ops.crop_to_box`, but nothing computes one from the PDF's own TrimBox/BleedBox metadata anymore. So all uploads render the bleed area.

**Fix**: When the inspector finds a `TrimBox` (or `BleedBox` smaller than `MediaBox`) on page 1, use it as the default `render_box` for `generate_previews`. Specifically:

- In `pdf-server/app/services/pdf_ops.py`, add a small helper (`derive_default_render_box(pdf_path) -> list[float] | None`) that:
  - Opens the PDF with pikepdf.
  - For page 1, returns `TrimBox` if present and strictly inside `MediaBox` (with a tiny tolerance, e.g. ≥1pt difference on any edge). Falls back to `BleedBox` only if `TrimBox` is absent and `BleedBox` is strictly inside `MediaBox`.
  - Returns `None` when the boxes are equal/missing (so we don't crop a clean PDF).
- In `pdf-server/app/tasks/document_tasks.py`, the auto-trigger after upload (around line 156–157) computes this default and passes it through:
  ```python
  default_box = pdf_ops.derive_default_render_box(local_pdf_path)
  task = generate_previews.delay(asset_id, preview_job_id, default_box)
  ```
- The existing explicit-`render_box` POST endpoint behaviour is unchanged (user-supplied box still wins).
- `crop_to_box` already exists and is rotation-aware, so per-page rendering then crops to the trim region and the previews/thumbnails will be edge-to-edge.

**Verification**: re-uploading the user's pink-bordered PDF should produce previews where the magenta border touches the page edge instead of sitting inside a white bleed margin.

## 2. Remove CSS binding artwork (frontend)

**File**: `src/components/preview/BindingSpine.tsx`

- Delete the `imageFailed` state, the `useEffect` that resets it, the `fallbackBg` gradient, and the `onError` handler.
- Always render the resolved `<img>` from `resolveBindingArt(...)`. The resolver in `bindingAssets.ts` already has a comprehensive fallback ladder (exact → opposite edge → default colour → legacy PNG), so it is guaranteed to return a real PNG `src` — never empty.
- The saddle-stitch / perfect-bound branch (subtle crease lines, not artwork) is unrelated and stays.

That's it for the binding side — the artwork registry is correct and complete; we just stop second-guessing it.

## Files touched

- `pdf-server/app/services/pdf_ops.py` — add `derive_default_render_box`.
- `pdf-server/app/tasks/document_tasks.py` — pass derived render_box into `generate_previews.delay`.
- `src/components/preview/BindingSpine.tsx` — strip `fallbackBg` / `imageFailed` / `onError`; always render `<img>`.

No DB migrations, no schema changes, no orientation-policy changes.
