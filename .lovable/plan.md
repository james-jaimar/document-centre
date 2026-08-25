# Calendar Store — remix plan

Build a calendar storefront as a remix of this project: same platform, same PDF pipeline, plus one new product type (Calendars) with an admin-defined artwork template and customer-filled photo boxes.

## 0. Separate app or bolt onto PrintStream?

Recommendation: **separate app + separate database, with a one-way live bridge into PrintStream** — not a later MIS ingest, and not building the store inside PrintStream.

What PrintStream actually is today (checked in the snapshot): its own Supabase project (`kgizusgqexmlfcqfjopk`), ~120 tables of MIS — `production_jobs`, `job_stage_instances`, the scheduler and its gap-filling logic, labels, tracker, Excel import. It already has a light customer-order path (`pp_orders` → `pp_skus` → `pp_stage_templates` → `production_jobs`) but **no cart, no payments, no invoicing, no guest checkout** — no Payfast or Stripe anywhere in the codebase. It's a B2B "order now, get billed later" intake, not a shop.

Building the calendar store inside PrintStream means writing cart, payment, invoicing, tax invoices, customer accounts, storefront theming, and the whole canvas/box builder from scratch inside a live production scheduler, and exposing that scheduler's database to the public internet. The remix gives you all of that on day one.

The reason people bolt on — "otherwise I have to ingest later" — goes away if the bridge is built at the same time as the store rather than after. It's one edge function.

### The bridge

When a calendar order is paid in the calendar store:

1. Store finalises the order and the 12-page print-ready PDF (GCP PDF server, as today).
2. Store calls a small `push-to-printstream` edge function.
3. That function calls a new edge function in PrintStream (service-role, shared secret) that inserts a `pp_orders` row against a `CALENDAR-*` SKU, with `client_reference` = the store's order number, `imposed_pdf_path` = the print-ready PDF, plus quantity and due date. PrintStream's existing SKU → stage-template → `production_jobs` path takes it from there.
4. PrintStream writes status back (optional, phase 2): a webhook to the store updates the customer-visible order status from the scheduler's stage progress.

The PDF itself is copied into PrintStream storage (or served via a signed URL the function fetches once) so the MIS is not dependent on the store's bucket.

Cost of this choice: two databases to keep in step on one contract point — the SKU mapping and the order-status vocabulary. That is a much smaller surface than merging a shop into a scheduler.

Bolt onto PrintStream only if the calendars will never take card payment (invoiced-on-account only) and the customers are already PrintStream account holders. If that's the actual situation, say so and this plan changes shape completely.

## 1. Remix and new backend

- Remix the project in Lovable (keeps all code: platform/tenant/branch tiers, cart, payments, quotes, PDF pipeline).
- Connect a **new external Supabase project** to the remix. The remix does not carry over data, so the schema must be recreated:
  - Export the current schema (tables, enums, functions, triggers, RLS, grants) and apply it to the new project as one baseline migration.
  - Create the storage buckets and their `storage.objects` policies.
  - Re-add secrets (payment gateway, SMTP/email, PDF API, Turnstile) — none carry across.
  - Edge functions redeploy automatically against the new project.
- Seed **one tenant** with one branch, locale ZA/metric, and toggle every product family off except Calendars. Nothing else is deleted — other products stay in the codebase, just hidden.
- Keep the GCP PDF server at `api.document-centre.com`. It is shared, so add a per-project API key/allowlist so the calendar store authenticates separately from Document Centre.

## 2. Calendar product model

New product kind `calendar`, alongside `canvas_wrap` / `photo_print`.

Admin creates **calendar templates** (the 8 artwork layouts). Each template is:

- A base PDF (12 pages, one per month) uploaded by the admin.
- A set of **photo boxes** drawn by the admin on the rendered page, each with a name, x/y/w/h in mm, fit mode (cover/contain), and optional corner radius.
- Boxes are **shared across all 12 pages**: one image per box, repeated on every month page. (Positions are defined once on a reference page.)
- Price via the existing rate-card / pricing-rule machinery.

Customer-supplied artwork is also supported: the customer can upload their own 12-page PDF as the base, in which case it prints as-is with no boxes (a "supply your own artwork" layout). Box drawing stays admin-only.

## 3. Admin box editor

New admin screen: upload template PDF → render page 1 with pdf.js → draw/drag/resize rectangles over it → boxes saved in mm relative to the trim box. Includes a zoom/pan canvas, snapping, and a numeric x/y/w/h panel for precision.

## 4. Customer builder

New builder (patterned on the canvas prints builder, which already does upload → crop → live preview → cart):

- Pick one of the 8 layouts (thumbnail gallery).
- For each box: upload a PDF or image (PDF page 1 rasterised, as canvas prints already does), crop/zoom inside the box aspect, resolution/DPI warning badge.
- **Live preview**: month-by-month pager showing the rendered base page with the customer's images composited into the boxes, so all 12 pages are viewable before checkout.
- Quantity, then straight into the existing cart → payment → order flow, unchanged.

## 5. Print-ready output

Extend the PDF server with a `calendar-compose` job: take the base template PDF, stamp each supplied image into its box on every page at full resolution, honour bleed and CMYK conversion, and emit the 12-page print-ready PDF into the existing production artefact flow. The existing `enqueue-print-ready` / `production-pdf` path and admin job screens then work with no changes.

## 6. Order of work

1. Remix + new Supabase + schema baseline + secrets + single tenant seed.
2. Calendar template schema (templates, boxes, template pages) and admin CRUD.
3. Admin PDF box editor.
4. Customer calendar builder with live preview.
5. PDF server compose endpoint + wire into print-ready.
6. PrintStream bridge: `CALENDAR-*` SKU + stage template in PrintStream, receiving edge function, push on payment.
7. Branding, pricing, and go-live checks.

## Technical notes

- New tables: `calendar_templates` (tenant/branch scope, base PDF path, page count, trim size, status), `calendar_template_boxes` (template_id, name, x/y/w/h mm, fit mode, sort order), all with grants + RLS mirroring the existing catalogue tables.
- Order spec stored as `order_items.spec.calendar` with `template_id` and a `boxes[]` array of `{ box_id, document_id, storage_path, crop, zoom, rotation }` — same shape family as `CanvasPrintEntry`, so the tile/editor patterns port over.
- Preview compositing runs client-side on canvas from the rasterised template page + cropped images; production compositing runs server-side from the original PDF/images, never from the preview raster.
- Reuse `rasterisePdfPageOneToImage`, `DebouncedColorInput`, `ResolutionBadge`, and the QR mobile-upload flow as-is.
- Bridge auth: shared secret held as a secret in both projects; the PrintStream receiver validates it in code and never accepts anonymous calls. Idempotent on `client_reference` so a retry cannot double-create a job.
