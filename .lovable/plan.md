## Goal

For **booklets** (and any bound product) when the customer uploads a **1-page front cover** and/or a **1-page back cover**, the system must treat the unseen face of each cover sheet as a real blank page — both visually in the preview and physically in the merged print-ready PDF that goes to the press.

Right now:
- Cover sections already get `is_duplex = false` for 1-page uploads (good).
- `buildJobSnapshot` emits a `{ kind: "blank_page", reason: "simplex_cover_back" }` directive in `configuration.merge_directives`, but it's always inserted **after** every simplex cover — wrong for the back cover, and the pdf-server doesn't read these directives anyway.
- Preview already injects a `blank_back` after a simplex front cover, but does **not** inject a blank face **before** a simplex back cover in saddle-stitched / bound layouts.

This plan wires up all three layers (frontend snapshot, preview, pdf-server merge) so a 1-page cover and a 1-page back cover always produce a physical 4-face sheet pattern: `[front | blank][...body...][blank | back]`.

## Changes

### 1. `src/lib/orders/buildJobSnapshot.ts` — fix directive position

`buildMergeDirectives` currently appends the blank directive after every cover. Split the rule by section type:

- `front_cover` simplex → emit `section` then `blank_page` (back face of front).
- `back_cover` simplex → emit `blank_page` then `section` (face preceding back).

Rename the reason to two values for clarity:
```ts
type MergeDirective =
  | { kind: "section"; section_id: string; section_type: string }
  | { kind: "blank_page"; reason: "simplex_cover_back" | "simplex_back_cover_front" };
```

### 2. `src/components/order/PreviewPanel.tsx` — show blank face before simplex back cover

Inside the `buildPageSequence` / role-assignment block (around lines 423–488), after assembling `fp`/`roles`, if the last user section is a `back_cover` whose document is a single page (i.e. simplex), insert a `blank_back` face immediately before it so the booklet preview shows the inside of the back cover as a real blank. Apply only for `isBound` products to avoid affecting flyers/business cards/posters.

Mirror the same change in `src/lib/orders/buildPreviewSnapshot.ts` so the placed-order viewer (admin/customer order detail) matches.

No new role is needed — `blank_back` already participates in `BLANK_PAPER_ROLES` and renders correctly.

### 3. `pdf-server/app/tasks/production_tasks.py` — honour merge_directives during assembly

Extend `assemble_print_ready_for_job` to consume `configuration.merge_directives` if present:

- Resolve each `section` directive's `section_id` → its source document via `document_sections.document_id` (already joinable from the bundle).
- For `blank_page` directives, generate a single blank PDF page sized to the resolved target spec (`bundle.target.width_mm/height_mm`, falling back to the previous section's actual trim size).
- Build `files` in directive order and feed into `pdf_ops.merge(...)` exactly as today.
- Keep current behaviour as a fallback when `merge_directives` is absent (legacy orders, photo prints, etc.).

Add a tiny helper in `pdf_ops` (or inline) that emits a one-page blank PDF at a given mm size — pikepdf/pypdf both already support `add_blank_page(width, height)` in points.

### 4. `src/lib/orders/buildJobSnapshot.ts` — include section→document lookup for the server

`merge_directives` already carry `section_id`. Confirm the orchestrator can resolve that to a `document_sections` row + `documents.storage_path` (or asset path) via `load_job_bundle`. If `document_sections` aren't currently loaded in the bundle, extend `load_job_bundle` to fetch them by `order_item_id` for the job's items, so the worker can map directive → source PDF.

## Out of scope

- Imposition (`assemble_imposed_sheet_for_job`) — it consumes the print-ready PDF that this plan fixes, so no separate change needed.
- Cover *duplex* uploads (2-page cover PDFs) — already handled correctly (face A = outside, face B = inside).
- Other product families' cover physics (brochures/flyers/business cards/posters) — already locked in by earlier passes.
- Pricing — sheet count is driven by `is_duplex` per section, which is already correct.

## Verification

1. Booklet (saddle-stitched) → upload single-page front cover PDF + single-page back cover PDF + multi-page body.
2. Preview shows: `[front | blank][body 1 | body 2]…[blank | back]`.
3. Place the order → admin opens the print-ready PDF artefact → it contains: page 1 = front cover, page 2 = blank, pages 3..N = body, page N+1 = blank, page N+2 = back cover.
4. Re-uploading a 2-page cover PDF still produces the duplex (no extra blanks) behaviour.
5. Existing brochures/flyers/business cards orders unaffected (no `isBound` change applies).
