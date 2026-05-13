# Where we are

The catalogue + pricing stack is done end-to-end:
- Master Rate Card (clicks, papers, finishing, photo prints) → `product_recipes` (with `engine`) → live pricing in builders + cart.
- Auto-seed defaults wired into Admin Products. Legacy pricing tab retired.
- All product families (Bound, Loose, Flyers, Posters, Brochures, Business Cards, Photo Prints) build, preview, price, and cart correctly.

What's **not** done is everything that happens *after* checkout: how the print operator actually receives, opens, and prints the file. Today an admin sees the order in `AdminOrderDetail` but there is no "production" surface — no print-ready PDF, no imposed sheet, no operator checklist, no download button.

# What this plan covers

1. **Production workflow** — what an operator sees and does for each order.
2. **Print-ready PDF generation** — turning the customer's uploaded PDF + spec into a file the press can run.
3. **PDF-server gap audit** — confirm we have every binary/library we need, flag what's missing.
4. **Other recommendations** — small but important things the system needs before going live to a real print shop.

---

## 1. Production workflow (admin surface)

New tab on `AdminOrderDetail`: **Production** (sits alongside Summary / Pricing / Delivery / Timeline).

Per order item it shows:

```text
┌─ Item: 50× A4 Bound Document, Wire-O, 80gsm body, 250gsm cover ─┐
│ Source PDF       [📄 cover.pdf]  [📄 body.pdf]   inspect ✓       │
│ Print-ready PDF  [⚙ Generate]  → [📄 print-ready.pdf]  ✓        │
│ Imposition       Single-up A4 SRA3 sheet  [⚙ Impose] [download] │
│ Job ticket       [📄 ticket.pdf]                                 │
│ Status           ☐ Ready to print  ☐ Printed  ☐ Bound  ☐ Done   │
└──────────────────────────────────────────────────────────────────┘
```

Each item has three artefacts the operator can download:
- **Print-ready PDF** — single PDF with covers + body (+ inserts/tabs) merged in correct order, oriented, and with bleed boxes set.
- **Imposed sheet PDF** — laid out N-up on the press sheet (e.g. 2-up A4 on SRA3 for bound bodies, 10-up business cards on SRA3, booklet-imposed for saddle-stitch). Generated on demand.
- **Job ticket PDF** — one-pager with order #, customer, qty, paper, finishing, special instructions, barcodes for tracking.

Production status checkboxes write to a new `order_item_production` table and feed the existing timeline.

A **"Production queue"** page (`/admin/production`) lists all paid orders not yet marked Done, sorted by promised date, with per-item status chips. This is the operator's daily worklist.

---

## 2. Print-ready PDF generation

The pdf-server already has `nup`, `impose-sheet`, and `booklet` operations. What's missing is the **assembly step** that turns an order item into one production-ready PDF before imposition.

New edge function `production-pdf` (or extend `pdf-api`) that, given an order item:

1. Loads the section list (`order_documents` ordered by `position`).
2. Resolves each section to its normalized PDF (`assets.normalized_storage_path`).
3. Calls a new pdf-server endpoint `POST /v1/operations/assemble-print-ready` with:
   - ordered section paths
   - target trim size + bleed
   - blank-back rules (covers `blank_back`, divider tabs, insert sheets)
   - duplex/simplex flag, mixed-orientation policy
   - cover stock vs body stock break (so imposition can split later)
4. Server merges, pads to multiples-of-4 for saddle stitch, inserts coloured insert sheets as real pages, applies tab artwork, writes a single PDF with correct **TrimBox + BleedBox** per page.
5. Result is registered as a derived file `kind = "print_ready_pdf"` against the asset and surfaced on the Production tab.

Imposition (existing endpoints) is then applied to that print-ready PDF on demand:
- Bound bodies → 2-up SRA3 booklet imposition or 1-up SRA3 perfect-bind, depending on binding.
- Business cards → 10-up SRA3 with crop marks + 3mm bleed.
- Flyers/posters → 1-up at trim, no imposition needed.
- Saddle-stitched booklets → existing `booklet` op.

**Decision points to confirm with you (low risk, defaults shown):**
- Default press sheet: SRA3 (450×320) for digital, with admin override per branch.
- Default bleed: 3mm.
- Crop marks + colour bars: on by default for imposed sheets.

---

## 3. PDF-server gap audit

Currently installed (from `Dockerfile` + `requirements.txt`):
- LibreOffice, Ghostscript, qpdf, poppler-utils, pdfcpu (best-effort), DejaVu fonts.
- Python: pikepdf, pypdf, Pillow, reportlab.

**Confirmed sufficient for:** Office→PDF, rasterise, page boxes, basic imposition, n-up, booklet, watermark, merge, rotate, crop.

**Gaps to fill before production-PDF generation:**

| Need | Recommended addition | Why |
|------|----------------------|-----|
| Embedded ICC colour profiles / PDF/X-1a conversion | `ghostscript` already does this — just need to install ICC profiles (FOGRA39 / SWOP / sRGB) and add a `convert-to-pdfx` op | Press operators expect PDF/X-1a or PDF/X-4 for colour-managed output |
| Preflight (overprint, font embedding, low-res images, RGB-in-CMYK) | `pdfix-sdk` (commercial) **or** lightweight DIY using `pikepdf` + `Pillow` for the checks we already do | We already have an in-house preflight; needs a proper PDF/X compliance pass |
| Missing-font auto-substitution on Office conversion | Install full font set: `fonts-liberation`, `fonts-noto`, `fonts-noto-cjk`, `fonts-symbola`, `ttf-mscorefonts-installer` | Avoid LibreOffice swapping fonts silently and breaking layout |
| Exact crop/bleed marks on imposed sheets | Already in `pdf_ops.impose_sheet_with_bleed` — just expose `show_crop_marks` / `show_bleed_outline` to admin | Operators want to toggle per-job |
| Tab divider / insert sheet rendering | reportlab (have it) | Build custom artwork pages on the fly |
| Barcode on job ticket | `python-barcode` or `reportlab.graphics.barcode` (built into reportlab) | Track jobs through production |
| Spot-colour preview / separation | Out of scope — only matters for offset, we're digital-only |

**Recommendation:** add `fonts-liberation fonts-noto fonts-noto-cjk fonts-symbola ttf-mscorefonts-installer` to the Dockerfile + install ICC profiles via the existing `scripts/install-icc-profiles.sh` (already exists, confirm it's run on boot). Skip pdfix-sdk for now; revisit if customers report colour issues.

---

## 4. Other recommendations

- **Order numbering on production artefacts** — every PDF (print-ready, imposed, ticket) must embed the order number + item number in the filename and as a footer slug, so a stack of paper on the production floor never gets confused.
- **Reprint trail** — store every generated print-ready PDF as a derived file with timestamp + admin user; if someone re-generates after a spec change, the old one stays available.
- **Production status visibility to customer** — when the operator ticks "Printed", flip the order to "In production" in the customer portal timeline. Already wired structurally; just needs the new statuses mapped.
- **Operator role** — `tenant_memberships.role = 'Production'` already exists. The new `/admin/production` page should be visible to Production + Admin + Owner only; hidden from Sales/Accounts.
- **Daily production digest email** — optional: 06:00 email to Production role with the day's queue. Cheap to add since `send-email` already exists.

---

## Technical breakdown

**Database**
- New table `order_item_production` (item_id PK, status enum, printed_at, bound_at, finished_at, operator_id, notes).
- New `derived_files.kind` values: `print_ready_pdf`, `imposed_sheet_pdf`, `job_ticket_pdf`.

**Edge functions**
- `production-pdf` (new) — orchestrates assemble + impose; thin wrapper over pdf-server.

**pdf-server**
- New op `POST /v1/operations/assemble-print-ready` (handler in `pdf_ops.py`, task in `operation_tasks.py`, route in `routes.py`).
- New op `POST /v1/operations/render-job-ticket` (reportlab, no external deps).
- `Dockerfile` — add font packages + ensure ICC profiles installed.
- `pdf-server/scripts/install-icc-profiles.sh` already exists; document running it post-deploy.

**Frontend**
- New `src/components/orders/detail/ProductionTab.tsx`.
- New `src/pages/admin/AdminProductionQueue.tsx` + sidebar link gated to Production/Admin/Owner.
- Hooks: `useOrderItemProduction`, `useGenerateProductionPdf`.

## Out of scope (this round)

- Offset/spot-colour separation.
- Full PDF/X-4 compliance certification.
- Press-operator mobile UI (the admin desktop view is enough for v1).
- Automatic imposition based on press-sheet inventory — operator picks the sheet for now.

## Suggested order of work

1. Audit + patch pdf-server (fonts + ICC) — small, unblocks colour fidelity.
2. Build assemble-print-ready op + production-pdf edge function.
3. Build Production tab on AdminOrderDetail (download + status).
4. Build AdminProductionQueue page.
5. Wire job ticket + reprint trail.
6. Optional: daily digest email.
