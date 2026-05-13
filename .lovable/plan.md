## Goal

Stand up the three production-PDF endpoints on `pdf-server` that the `production-pdf` edge function and `ProductionPanel` already expect, so admins can produce real, press-ready files from any job in the queue.

Today: only `assemble` works (basic merge of normalized PDFs). `impose` returns 501; `ticket` writes a placeholder path. We'll replace both with real renderers and harden assembly to be production-grade.

---

## 1. Smart assembly (replace the naive merge)

Promote the current edge-function merge to a dedicated pdf-server task `assemble_print_ready`:

- Resolve job → ordered section list (covers, body, tabs, inserts) using `order_documents` + `document_sections`, honouring the existing print-shop output rules (insert sheets are real PDF pages, no phantom blanks between docs — see memory).
- For each section, use `normalized_storage_path` (CMYK + oriented + sized via the existing `prepare_for_product` pipeline). If missing, run `prepare_for_product` on demand.
- Pad to multiples-of-4 for saddle-stitched products (reuse `pad_pages_pdf`).
- Merge with pikepdf preserving page boxes (Trim/Bleed/Media), then upload to `production/print-ready/{job_number}.pdf` and write `order_jobs.print_ready_pdf_path`.

Edge function becomes a thin proxy: POST → poll → write path.

## 2. Imposition endpoint `assemble_imposed_sheet`

Build on the existing `impose_sheet_pdf` task, but driven by the **product recipe** instead of raw geometry from the client:

- Look up product family + finished size from the order item snapshot.
- Decide imposition automatically:
  - Flyers/postcards → n-up grid on SRA3 (or tenant default press sheet) with crop marks + bleed marks.
  - Saddle-stitch booklets → booklet imposition (already implemented in `booklet_pdf`).
  - Bound documents → no imposition; just print-ready 1-up.
  - Photo prints → grid pack on the lab's standard sheet.
- Output → `production/imposed/{job_number}.pdf`, write `order_jobs.imposed_pdf_path`.

New schema field on `pricing_rules` or product config → `imposition_strategy` (auto | nup | booklet | none) so admins can override per product. Default `auto`.

## 3. Job ticket endpoint `render_job_ticket`

New ReportLab task `render_job_ticket(job_id)` that produces a 1-page A4 PDF containing everything the operator needs at the press:

- Header: tenant logo, job number, due date, customer name, order number
- Product spec block: product family, size, paper stock, weight (gsm), colour/sides, binding, finishing
- Quantity, page count, total sheets, run-on info
- Source files table: filename, page count, position in book
- QR code linking back to `/admin/orders/{order_id}` for one-tap dashboard access
- Footer: generated-at timestamp, operator slot, sign-off line

Output → `production/tickets/{job_number}.pdf`, write `order_jobs.job_ticket_pdf_path`.

Add `qrcode[pil]` to `requirements.txt` (small, pure-Python).

## 4. Edge-function rewiring

Replace inline merge code in `supabase/functions/production-pdf/index.ts` with three thin proxy paths:

- `assemble` → `POST /v1/operations/assemble-print-ready` { job_id }
- `impose`   → `POST /v1/operations/assemble-imposed-sheet` { job_id }
- `ticket`   → `POST /v1/operations/render-job-ticket` { job_id }

Each call:
1. Sends the job_id (the pdf-server fetches the job's data through a service-role Supabase call using existing env vars on the VPS).
2. Polls `/v1/jobs/{job_id}` until done.
3. Writes the returned `storage_path` back to `order_jobs.{print_ready|imposed|job_ticket}_pdf_path`.

This keeps all PDF logic on the pdf-server (where ICC profiles, fonts, qpdf, pikepdf, ghostscript and pdfcpu live) and out of Deno.

## 5. PDF-server toolchain audit

Confirm what's already installed on the VPS and add anything missing:

| Tool | Status | Purpose |
|------|--------|---------|
| Ghostscript | installed | rasterize, CMYK |
| qpdf | installed | merge/split/rotate |
| pikepdf | installed | precise page-box manipulation |
| pypdf | installed | basic merge |
| LibreOffice | installed | office → pdf |
| poppler-utils | installed | pdftoppm/pdfinfo |
| pdfcpu | installed (best-effort) | n-up/booklet imposition |
| reportlab | installed | job ticket rendering |
| **qrcode** | **add** | QR on job ticket |
| **fonts-noto-color-emoji** | optional | emoji in tenant names |
| **icc-profiles-free** | verify | required for print_ready |

`requirements.txt` += `qrcode[pil]==7.4.2`. Dockerfile already has the right system fonts.

## 6. Optional: imposition presets table

Tiny table `imposition_presets`:

```
id, app_id, name, sheet_w_mm, sheet_h_mm, bleed_mm, gap_mm, margin_mm, crop_marks
```

Lets a tenant configure their own press-sheet sizes (SRA3, B2, 12x18 etc.) without code changes. Out of scope for first pass — we'll ship sensible defaults and add the UI later.

---

## Technical notes

**Files to add/edit on pdf-server:**
- `app/tasks/production_tasks.py` — three new celery tasks
- `app/web/routes.py` — three new endpoints under `/operations/`
- `app/schemas/assets.py` — request models
- `app/services/production_orchestrator.py` — section ordering + recipe lookup (talks to Supabase via service role)
- `requirements.txt` — add `qrcode[pil]`

**Files to edit on Lovable:**
- `supabase/functions/production-pdf/index.ts` — rewrite to thin proxy
- `src/components/orders/detail/ProductionPanel.tsx` — remove the "Imposition coming next" disabled state

**No DB migration needed for first pass** — the three artefact columns on `order_jobs` are already there.

---

## Delivery order

1. Job ticket endpoint (smallest, fully self-contained, instantly useful — operator can print a real ticket today).
2. Smart assembly (replaces merge with section-aware version).
3. Imposition (depends on assembly being correct).
4. Wire edge function to all three.

I'll deliver in that order so you get visible progress at each step. After step 1 you'll be able to print a real job ticket from any job in the production queue.
