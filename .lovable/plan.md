## Goal

When a customer uploads ONE multi-page PDF and selects a printed heavyweight cover (e.g. 250gsm silk), the system silently treats the first 2 pages as the cover and the last 2 as the back cover, keeps the remaining pages as the body, and gives branch admin two separate production components — each with its own print-ready PDF and its own imposition setup.

## What the customer sees

Nothing extra. They upload the file, choose "Printed Cover (250gsm Silk)", and the price/spec summary shows:

```text
Cover   4pp   250gsm Silk   double-sided colour
Body   24pp    80gsm Bond   double-sided colour
```

No prompt, no extra step. If the file is too short to carve covers (< 5 pages), the whole file stays as body and the cover option is treated as body stock.

## Split rules

- Front cover = pages 1–2 (duplex).
- Back cover = last 2 pages (duplex); if what remains is odd/short, fall back to a 1-page simplex back cover.
- Body = everything in between.
- Splitting happens only when there is a single uploaded file. If the customer already uploaded separate cover files, nothing changes — the existing multi-section flow already handles it.
- Cover sections inherit the gsm/finish from the chosen printed-cover option; body keeps the body stock.

## Technical approach

**Data model** — no new tables. `document_sections` already carries `document_id`, `n_start`/`n_end` (page slice), `paper_stock`, `paper_weight_gsm`, `is_color`, `is_duplex`. The split writes three sections pointing at the same document with different page ranges. The PDF worker already honours `n_start`/`n_end` slicing in its merge directives.

**Frontend**
- New helper `src/lib/orders/autoCoverSplit.ts`: given the document page count and the selected printed-cover option metadata, return the three section descriptors (front_cover / body / back_cover) with page ranges and stock.
- Wire it into the bound-document flow (`OrderFiles.tsx` + `useOrderBuilder.ts`): when the cover option changes to a "Printed Cover" value and exactly one document is attached, reconcile sections to the split; when it changes away, collapse back to a single body section. Idempotent — re-running produces the same three rows.
- Spec/summary rendering shows the cover and body as separate lines with their stocks.

**Print-ready assembly (pdf-server)**
- `assemble_print_ready_for_job` gains a component-grouping step: group merge directives by paper stock/weight into ordered components (`cover`, `body`). When more than one component exists, emit one print-ready PDF per component into the existing `print_ready_pdf_paths` JSON array (already used by canvas prints), mirroring the first into `print_ready_pdf_path` for backwards compatibility.
- `assembly_report` gains a `components` array: `{ key, label, pages, paper, gsm, storage_path, width_mm, height_mm, duplex }`.

**Imposition**
- `assemble_imposed_sheet_for_job` accepts an optional `component` key and imposes just that component's print-ready PDF, storing results in a new `imposed_pdf_paths` JSON column on `order_jobs` keyed by component (migration adds the column; `imposed_pdf_path` still mirrors the first).
- Default suggestion per component: covers → full-bleed n-up on SRA3 (A5 → 4-up), body → n-up on the next size up (A5 → 2-up A4). The existing `IMPOSITION_MAP`/template picker supplies the ups count.

**Branch admin UI (`ProductionPanel.tsx`)**
- Renders one card per component instead of a single print-ready row: component label, page count, stock/gsm, size chip (reusing the bold size treatment added earlier), its own download button, and its own imposition template selector + generate/download.
- Single-component jobs render exactly as they do today.

## Out of scope for this round

- Creep/spine allowance changes for the split body.
- Automatic template creation — the imposition picker still chooses from existing templates, we only pre-select a sensible default.
