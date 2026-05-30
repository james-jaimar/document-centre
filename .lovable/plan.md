
## 1. Branch portal — on-brand sidebar, no text overrun

**Problem (from screenshot)**
- `PostNet — PostNet Sandt…` clips the branch name (tenant + branch concatenated on one line).
- `sandtoncityadmin@postne…` clips the user email in the footer.
- The active nav pill ("Orders") is generic white; it should pick up the tenant's brand colour (PostNet red).
- Logo slot doesn't show the tenant logo distinctly.

**Changes in `src/components/BranchSidebar.tsx`**
- Stack identity vertically: line 1 = tenant name (medium weight, truncate), line 2 = branch name in tenant primary colour (semibold), line 3 = "Branch Portal" muted. Drops the "—" concatenation entirely so neither name clips.
- Footer user block: shrink email to `text-[11px]`, keep `truncate`, and add `title={user.email}` so the full address is in a tooltip.
- When `branding.logo_url` exists, render at `h-9 w-auto max-w-[40px]` with `object-contain` so the actual mark shows instead of a square crop.
- Apply brand colour via inline CSS variable on the `<aside>`:
  - `style={{ '--brand': branding.primary_color }}`
  - Active nav pill uses `bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))]` with a 2px left border in `--brand`.
  - Collapse chevron + hover states tinted with `--brand`.
- Add the same treatment to `BranchLayout` top bar if it carries a title (quick check during implementation).

**Sidebar — no behaviour changes**, purely presentational. Admin/platform sidebars untouched.

## 2. Job ticket PDF — proper operator-grade layout

The current ticket (`pdf-server/app/tasks/production_tasks.py::_render_ticket_pdf`) is plain ReportLab with a "Document Centre" header, three small tables, and sign-off lines. It ignores branding, has no thumbnails, no pricing, no delivery details, and shows "Document Centre" instead of the branch.

### Data — extend `load_job_bundle` (`production_orchestrator.py`)

Add these optional fields to `JobBundle` and populate when available:
- `branch`: row from `branches` (name, address, phone, email) keyed off `order.branch_id`.
- `branding`: row from `tenant_branding` (logo_url, primary_color, secondary_color).
- `delivery_address`: latest row from `order_addresses` for this order where `kind = 'delivery'`.
- `order_item`: matching `order_items` row for unit/net price, currency, qty.
- `document_thumbnails`: for each document, prefer `documents.thumbnail_path`; otherwise rasterise page 1 of the resolved source PDF at ~120 DPI in the worker workspace.

Branch/branding/address fetches are best-effort (`try/except` → `None`), so no migration required and existing tickets continue to render when fields are missing.

### Rendering — rewrite `_render_ticket_pdf`

Single A4 page, generous whitespace, brand-led:

```text
┌──────────────────────────────────────────────────────────┐
│ [Tenant Logo]  PostNet Sandton City              Job     │  ← brand-coloured band
│                123 Rivonia Rd · 011-234-5678     Ticket  │
├──────────────────────────────────────────────────────────┤
│  INV-00069-1                              ████ QR ████   │
│  Booklets · 5 copies                      (links to      │
│  Due: Mon 2 Jun · Urgency: Normal          admin order)  │
├──────────────────────────────────────────────────────────┤
│ CUSTOMER             │ FULFILMENT          │ PRICING     │
│ James Hawkins        │ Collection          │ Unit  R 43.70│
│ Acme Co              │ PostNet Sandton City│ Qty   ×5    │
│ james@acme.co.za     │ 123 Rivonia Rd      │ Net   R 218.50│
│ +27 82 ...           │ Sandton, 2196       │ Paid (EFT)  │
├──────────────────────────────────────────────────────────┤
│ PRODUCTION SPECS                                          │
│ Size A4 (A3 folded)   Paper 80gsm White Bond   ...        │
│ Colour Full Colour    Sides  Duplex            ...        │
│ Binding Saddle stitch Cover  Printed (same stock)  ...    │
├──────────────────────────────────────────────────────────┤
│ DOCUMENTS                                                 │
│  ┌──┐  body.pdf            8 pages   A4   12.3 MB         │
│  │📄│                                                      │
│  └──┘                                                      │
│  ┌──┐  cover.pdf           2 pages   A3   3.1 MB          │
├──────────────────────────────────────────────────────────┤
│ Operator ______  QC ______  Started ____  Completed ____  │
│ Notes ____________________________________________________│
│                                                            │
│ Generated 2026-05-30 15:42 UTC · Powered by Document Centre│
└──────────────────────────────────────────────────────────┘
```

Implementation notes:
- Use the tenant `primary_color` for the top band, the job-number divider rule, and section header underlines. Fallback to slate-700 if missing.
- Logo via `RLImage` from the branding `logo_url` (download to workspace, scale to 18mm height). Skip silently on error.
- Three-column block (Customer / Fulfilment / Pricing) is a single `Table` with 60/60/65mm columns and an outer `LINEABOVE`/`LINEBELOW`.
- Production specs grid stays the resolved-target-aware block we have today, but rendered as a 2-column key/value layout in 3 visual columns (so up to 9 specs fit without overflow).
- Documents list: for each document, render a 22×28mm thumbnail (or a placeholder doc icon) next to filename, page count, detected size, file size.
- Sign-off row condensed to a single line; QR moves to top-right.
- Footer reads "Generated … by Document Centre" so the platform brand stays, but the page itself is fully tenant-branded.

### Files touched
- `pdf-server/app/services/production_orchestrator.py` — extend `JobBundle` + `load_job_bundle`.
- `pdf-server/app/tasks/production_tasks.py` — rewrite `_render_ticket_pdf`, add a small thumbnail helper.
- `src/components/BranchSidebar.tsx` — branded identity + footer fixes.

No DB migrations, no edge-function changes, no API contract changes. Existing "Print ticket" button in `ProductionPanel` keeps working — it just produces a much nicer PDF.

## Out of scope (intentionally)
- Admin & platform sidebars (only branch is on-brand per the request).
- Multi-page tickets / per-section breakdowns (branches are small, one page is the brief).
- Live preview of the ticket in the web UI (not requested; PDF only).
