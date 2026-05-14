# Imposition worker — IMPLEMENTED ✅

## Tools available on the VPS

Installed by `scripts/install-ubuntu.sh`:

- **Ghostscript** — CMYK conversion (`to_print_ready_cmyk`), greyscale, rasterise.
- **qpdf** — fast normalize / linearize.
- **poppler-utils** — `pdftoppm`, `pdftotext`, `pdfimages`.
- **mupdf-tools** — `mutool poster|merge|draw` (fast page transforms, second opinion when pikepdf chokes on weird producer PDFs).
- **pdfcpu** — `pdfcpu nup|booklet|grid|cut|validate` — installed by `scripts/install-pdfcpu.sh`. Used as a fallback / sanity-check engine.
- **Python**: pikepdf 9.x (primary imposition engine), pypdf 5.x, reportlab 4.x, Pillow 11.x.
- **ICC profiles**: sRGB + FOGRA39 CMYK in `/opt/document-centre-api/icc/` for the GS pipeline.

## Imposition strategies

`assemble_imposed_sheet_for_job` (`app/tasks/production_tasks.py`) decision tree:

1. **Customer-uploaded press-sheet template** (`order_jobs.imposition_template_id` set) → `pdf_ops.impose_with_template()`. The template artwork owns crop marks / colour bars; we just stamp customer pages into the slot rectangles.
2. **Saddle-stitch binding** (or `production_specs.imposition_strategy = "booklet"`) → `pdf_ops.booklet_saddle_stitch()` — proper signature ordering with creep compensation.
3. **Cut-sheet products** (Flyers, Postcards, Cards, Leaflets, Loose Sheets) or `imposition_strategy = "nup"` → `pdf_ops.impose_nup_trimbox()` — TrimBox-aware grid with crop marks at trim corners.
4. **Anything else** → 1-up no-op (print-ready PDF copied into the imposed slot).

## Industry-standard guarantees of the new engine

`impose_nup_trimbox` (`app/services/pdf_ops.py`):

- Reads each customer page's **TrimBox** with the standard fallback ladder: `TrimBox → BleedBox shrunk by fallback inset → MediaBox shrunk by fallback inset` (matches the project's documented "Trim → Crop → Media" rule).
- Slot pitch = first page's trim size. Mixed-trim documents get clipped to slot 1.
- `gutter_mm = 0` (default) → "gang up" mode: trim edges of adjacent slots butt against each other; bleed from one slot extends visually into its neighbour.
- `gutter_mm > 0` → real gap between trim edges (cutter relief).
- Bleed configurable per job via `production_specs.bleed_mm` (default 3 mm).
- Crop marks at trim corners with configurable offset (3 mm) and length (5 mm).
- Registration crosshairs in 4 sheet-margin corners.
- Output sheet has its own MediaBox / TrimBox / BleedBox stamped so downstream tools know the live area.

`booklet_saddle_stitch` (`app/services/pdf_ops.py`):

- Pads source to multiple of 4 with blank pages.
- Standard saddle-stitch signature ordering (sheet 1 front = [N, 1], etc.).
- **Creep compensation**: `creep_per_sheet_mm × sheet_index` — outermost sheet zero shift, innermost gets the largest. Configurable per job via `production_specs.creep_per_sheet_mm`.
- Crop marks at sheet corners + dashed fold mark at the spine.
- TrimBox-aware page placement (each source page's trim is what gets fitted into the half-sheet).

## Colour pipeline

Imposition does NOT alter colour space — the imposed PDF inherits the colour space of the print-ready input. CMYK conversion (`to_print_ready_cmyk`) is a separate orchestrator step with its own ICC ladder (FOGRA39 default). Greyscale conversion (`grayscale`) is also separate and Ghostscript-driven. The "already CMYK" fast path in `to_print_ready_cmyk` means imposed-then-CMYK on a PDF that was already CMYK is a copy-only no-op.

## Per-job overrides (`order_jobs.production_specs`)

```jsonc
{
  "imposition_strategy": "nup" | "booklet" | "none",   // override auto-pick
  "press_sheet": { "width_mm": 320, "height_mm": 450 }, // default SRA3
  "bleed_mm": 3.0,
  "gutter_mm": 0.0,
  "creep_per_sheet_mm": 0.0
}
```

## Out of scope (next round)

- Perfect-bound / PUR / wire-o / spiral imposition (different signature math).
- Work-and-turn / work-and-tumble sheet ordering — currently treated as `cut_sheet`.
- Procedural colour bars / star targets (templates own these today).
- Auto-pick template from branch press.
- Mixed-trim documents (e.g. cover + body in one PDF) — first page's trim sets the slot pitch.

## Endpoints

- `POST /v1/operations/assemble-imposed-sheet` — `{ "job_id": "<uuid>", "imposition_template_id": "<uuid?>" }` — kicks off `assemble_imposed_sheet_for_job`. Persists result to `order_jobs.imposed_pdf_path`.
