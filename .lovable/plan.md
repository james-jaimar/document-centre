# Imposition: audit + plan

## 1. What's actually on the pdf-server today

**Installed (via `scripts/install-ubuntu.sh` on the VPS):**
- ghostscript, qpdf, poppler-utils, libreoffice, fonts
- Python: pikepdf 9.4, pypdf 5.0, reportlab 4.2, Pillow 11
- ICC profiles (sRGB, FOGRA39 CMYK) via `install-icc-profiles.sh`

**In the Dockerfile but NOT on the VPS:** pdfcpu 0.6.0 (gap — needs adding to `install-ubuntu.sh`).

**Not installed anywhere:** mutool (mupdf-tools), pdfjam, podofoimpose, bookletimposer.

**Imposition functions in `app/services/pdf_ops.py`:**

| Function | What it does | Honest verdict |
|---|---|---|
| `nup()` | Grid scale-to-fit using MediaBox | Naive. No TrimBox awareness, no bleed, no crop marks. |
| `impose_sheet_with_bleed()` | Grid with crop marks + bleed slots | **Bleed is faked** — it scales the source MediaBox into a `slot − 2·bleed` rectangle. If the source already has bleed, it gets scaled down again. Crop marks are anchored to the slot's trim guess, not to the source's TrimBox. |
| `impose_with_template()` | Stamps customer pages onto a press-sheet template via `add_overlay` | Works for templates the platform admin pre-built (they own the marks/colour bars). Still unaware of customer TrimBox — the *whole* customer MediaBox is fitted into the slot rectangle. |
| `booklet()` | Folio 2-up reader spreads | No creep, no signature size, no crop marks, no spine bleed. Fits MediaBox into half-sheet. |
| `to_print_ready_cmyk()` | GS pipeline with FOGRA39 ICC | ✅ correct, this is fine. Greyscale via `grayscale()` is also fine. |

**Box reading:** `inspect()` already reads MediaBox / CropBox / TrimBox / BleedBox / ArtBox correctly. The data is there — the imposer just doesn't use it.

## 2. Industry-standard requirements you listed, mapped to gaps

| Requirement | Status | Gap |
|---|---|---|
| Read MediaBox / TrimBox / BleedBox | Partial | Read OK; **not used during imposition** |
| Resize source pages | ✅ `resize_pages()` exists | — |
| 2-up / n-up with shared 2.5–3 mm bleed | ❌ | Need TrimBox-aware placement that butts trim edges or leaves true gutter |
| Crop marks relative to **trim** | ❌ | Marks are drawn at slot edges, not at customer TrimBox |
| CMYK + greyscale outputs | ✅ | Re-run CMYK pass after imposition (already a separate step) |
| Booklet imposition with creep | ❌ | Current `booklet()` is folio-only, no creep |
| Work-and-turn / work-and-tumble | ❌ | Not modelled |

## 3. Other software — what's worth adding

I checked the usual suspects ChatGPT recommends for print-shop pipelines:

- **pdfcpu** (Go, Apache-2.0) — `nup`, `booklet` (with fold/cut guidelines), `grid`, `cut`, `rotate`, validation. Already in Docker, missing from VPS installer. **Add it.** Useful as a fast fallback and for self-checks.
- **mutool** (`mupdf-tools`, AGPL) — `mutool poster`, `mutool merge`, `mutool draw` for fast page extraction/transforms. ~3 MB. **Add it.** Handy as a second opinion when pikepdf chokes on weird producer PDFs.
- **podofoimpose** — script-driven plan files (.plan). Powerful, but obscure DSL and AGPL — adds maintenance burden. **Skip.**
- **pdfjam** — needs a full TeX Live install (~1 GB). **Skip.**
- **bookletimposer** — does less than pdfcpu. **Skip.**
- **Scribus / Quite Imposing / Krop / Impose+** — desktop / commercial. Not a fit for a headless server. **Skip.**

Net: **add pdfcpu and mutool**, build the real engine ourselves in pikepdf (where we already live).

## 4. What to build

### 4a. New TrimBox-aware n-up imposer

Replace `impose_sheet_with_bleed` (keep the old one for backwards-compat behind a flag) with `impose_nup_trimbox()` using **pikepdf** so we control the box model directly:

For each customer page:
1. Resolve the **trim rectangle** = `TrimBox` ∥ `BleedBox shrunk by tenant default` ∥ `MediaBox shrunk by tenant default`.
2. Compute the **bleed rectangle** = TrimBox grown by configured bleed (default 3 mm, tenant-overridable per product).
3. Place the **bleed rectangle** at a known anchor inside each slot (top-left + slot offset). Two layout modes:
   - **Gang-up with shared bleed** — adjacent slots butt their trim edges; bleed overlaps into neighbour. Reduces paper waste.
   - **Gutter** — slots separated by `2 × bleed + cut allowance`.
4. Crop marks drawn at TrimBox corners with configurable offset (default 3 mm gap from trim, 5 mm length).
5. Optional registration marks + colour bars in waste area.
6. Output a fresh sheet PDF whose MediaBox is the press sheet (e.g. SRA3 320×450 mm) and whose TrimBox marks the live area.

### 4b. New booklet imposer

Replace `booklet()` with `booklet_saddle_stitch()`:
- Pads to multiple of 4.
- Computes signature order: page N pairs with page 1, page 2 with page N-1, etc., onto sheet faces.
- **Creep compensation**: each signature shifts content inward by `creep_per_sheet × distance_from_centre` (default 0.1 mm per sheet, configurable).
- Optional spine bleed for full-bleed inner spreads.
- Crop marks at trim, fold mark at spine.
- Cover-separate option (cover printed on heavier stock, body printed separately).

For perfect-bound / wire-o — out of scope for v1, separate plan later.

### 4c. Engine selection

`assemble_imposed_sheet_for_job` decision tree (already wired, just expand the branches):
1. Customer-uploaded template (`imposition_template_id`) → `impose_with_template` (but upgrade it to honour customer TrimBox when stamping).
2. Saddle-stitch binding → `booklet_saddle_stitch`.
3. Cut-sheet product (Flyers, Postcards, Cards) → `impose_nup_trimbox` with auto-computed columns/rows from press sheet ÷ trim size.
4. Anything else → 1-up no-op (current behaviour).

### 4d. CMYK pass

Imposed PDF goes through `to_print_ready_cmyk()` after imposition (this already happens for print-ready; just chain it after the imposition step in the orchestrator).

### 4e. VPS install changes

- Add `mupdf-tools` to the apt list in `scripts/install-ubuntu.sh`.
- Port the pdfcpu install block from `Dockerfile` into a new `scripts/install-pdfcpu.sh` and call it from `install-ubuntu.sh`.
- Bump `requirements.txt` only if we need a newer pikepdf for `transform=` overlays (currently 9.4 — fine).

## 5. Out of scope (call out for next round)

- Perfect-bound / PUR / wire-o / spiral imposition.
- Work-and-turn and work-and-tumble sheet-ordering modes (we'll lay groundwork in the imposer signature but default to `cut_sheet`).
- Procedural colour bars / star targets (right now templates own these).
- Auto-template selection per branch press (already noted in the IMPOSITION_WORKER_SPEC).

## 6. Files that will change

```text
pdf-server/scripts/install-ubuntu.sh         # add mupdf-tools, call install-pdfcpu.sh
pdf-server/scripts/install-pdfcpu.sh         # new (mirrors Dockerfile block)
pdf-server/app/services/pdf_ops.py           # new impose_nup_trimbox + booklet_saddle_stitch
pdf-server/app/tasks/production_tasks.py     # wire booklet branch + chain CMYK pass
pdf-server/docs/IMPOSITION_WORKER_SPEC.md    # document new strategies + tools
```

No UI changes in this round — once the engine is solid we can expose per-product creep / bleed defaults in `/platform/imposition`.

