
# Smart print-ready pipeline — triggered on payment

## Goal

Stop treating "Assemble print-ready PDF" as a manual operator step that always rebuilds from scratch. Instead, when an order is paid, walk each job, compare the customer's final spec (size, colour mode, sides, bleed, multi-doc order) to the PDF that already exists in storage, and only do the work that's actually needed. The output is one canonical print-ready PDF per job, ready for download or imposition.

## Source of truth

For each job, the spec lives on:
- `order_jobs.product_snapshot` — finished size (width_mm/height_mm), orientation, family
- `order_jobs.configuration` — colour mode, sides, print-to-edge / bleed, finishing
- `order_documents` (ordered) — uploaded PDFs already converted to CMYK at upload time
- `order_jobs.print_ready_pdf_path` — set if/when assembly has completed

The customer's already-uploaded PDF is the raw input. The product spec is the target. The pipeline is the delta.

## Trigger

A paid order kicks off assembly. No work happens before payment — saves VPS resources, prevents wasted re-runs as customers tweak.

```text
orders.payment_status: 'unpaid' → 'paid'
        │
        ▼
  edge fn: production-pdf  (action: "assemble", job_id: …)
        │  (for each order_jobs row in the order)
        ▼
  pdf-server: assemble_print_ready_for_job  (smart mode)
        │
        ▼
  order_jobs.print_ready_pdf_path  +  assembly_report JSONB
```

Implementation: a Postgres trigger on `orders` (after update of `payment_status`) calls a new edge function `enqueue-print-ready` via `pg_net`, which fans out one `production-pdf assemble` call per `order_jobs` row in the order. Manual "Assemble" button in the production panel stays as a re-run / override.

## Smart assembly decision tree

`assemble_print_ready_for_job` is rewritten to be diff-driven. For each job:

```text
1. Load: documents[], target_size_mm, target_orientation,
         colour_mode, sides, print_to_edge, family
2. For each uploaded PDF, read TrimBox / MediaBox / colour space (cached
   from upload-time preflight where available)
3. Build a per-job work list:
     - merge?     → len(documents) > 1   (always honour ordering)
     - resize?    → any page's trim != target ± tolerance
     - reorient?  → page orientation != target orientation
     - greyscale? → colour_mode == "bw" AND source has colour ink
     - bleed?     → print_to_edge AND no detectable bleed margin
     - cmyk?      → source not already CMYK (rare — upload usually did it)
4. Execute only the steps in the work list, in this order:
     merge → reorient → resize → bleed-expand → greyscale → (cmyk if needed)
5. If work list is empty AND single document → reuse uploaded PDF path
   directly (write to print_ready_pdf_path, do NOT re-upload bytes)
6. Persist report: { reused_source: bool, steps: [...], timings_ms: {...} }
```

This uses the existing `pdf_ops.prepare_for_product` building blocks plus a new merge-first wrapper.

## Per-decision rules (confirmed)

| Spec input | Rule |
|---|---|
| Size mismatch (e.g. A4 source, A5 ordered) | Resize at assembly time (not before). Fit-scale; preserve orientation. |
| B&W toggle | Ghostscript greyscale at assembly time. Original CMYK upload untouched (reused for any future colour re-order). |
| Print-to-edge, no bleed in source | Auto scale-up content by 3 mm on every edge to manufacture bleed. Warn flag set in report so operator knows edges may clip. |
| Multi-document job | Merge in `order_documents.sort_order`, then run remaining steps once on the merged file. Honours existing section-ordering rules. |
| Already matches everything | Skip work entirely; point `print_ready_pdf_path` at the source. |

## Where things land

- `order_jobs.print_ready_pdf_path` — canonical output (existing column)
- `order_jobs.assembly_report` — new JSONB column with `{ reused_source, steps, warnings, source_doc_ids }`
- `order_jobs.print_ready_assembled_at` — new timestamp for cache-busting
- `order_jobs.print_ready_spec_hash` — new text column = hash of the spec inputs that produced this PDF. If admin re-runs and the hash matches, return cached result instantly.

Imposition step is unchanged in shape — it still reads `print_ready_pdf_path` — but it now always gets a PDF that's the right size, colour and orientation, so the imposition templates can be authored against a single canonical input.

## Operator UX

`ProductionPanel.tsx` shows the report inline:
- "Print-ready reused source PDF (no work needed)"
- "Print-ready built: resized A4→A5, merged 3 documents, added 3 mm bleed"
- Warning chip when bleed was auto-fabricated
- "Re-assemble" button forces a rebuild (ignores spec hash) — useful if customer support replaces a source file

## Technical section

Files to touch:

- `supabase/migrations/…` — add `assembly_report jsonb`, `print_ready_assembled_at timestamptz`, `print_ready_spec_hash text` to `order_jobs`; add trigger on `orders.payment_status → paid` that calls new edge fn.
- `supabase/functions/enqueue-print-ready/index.ts` — new. For an order id, loads jobs and invokes `production-pdf` `assemble` per job.
- `supabase/functions/production-pdf/index.ts` — already routes `assemble`; pass through a new `force?: boolean` flag for the re-assemble button.
- `pdf-server/app/services/production_orchestrator.py` — extend `JobBundle` with `target_width_mm`, `target_height_mm`, `target_orientation`, `colour_mode`, `print_to_edge`, `documents_ordered`.
- `pdf-server/app/services/pdf_ops.py` — add `greyscale(src, out)` (GS `-sColorConversionStrategy=Gray`), `expand_for_bleed(src, out, bleed_mm)`, `detect_bleed(src) → bool`, `spec_hash(inputs) → str`.
- `pdf-server/app/tasks/production_tasks.py` — rewrite `assemble_print_ready_for_job` around the decision tree; reuse `prepare_for_product` where possible; write report + hash back via `write_job_field`.
- `src/components/orders/detail/ProductionPanel.tsx` — show report, expose "Re-assemble" with `force: true`.

Out of scope this round:
- Non-proportional size changes (A4 portrait → A5 landscape) — fall through with a warning; operator handles.
- Re-running on configuration change while still in cart — by design, only paid orders trigger.
- Imposition refactor — separate workstream.

## Verification

- Paid order with single A4 PDF ordered as A4, simplex, colour, no bleed → report shows `reused_source: true`, no new bytes uploaded.
- Paid order with A4 source ordered as A5 → resized only; output trim = A5.
- Paid order with 3 PDFs, ordered B&W, print-to-edge → merge + greyscale + bleed-expand, single warning chip in admin.
- Re-clicking "Assemble" without `force` is instant (hash hit).
