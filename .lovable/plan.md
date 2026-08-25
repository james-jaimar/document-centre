# Calendar Store — remix plan

Build a calendar storefront as a remix of this project: same platform, same PDF pipeline, plus one new product type (Calendars) with an admin-defined artwork template and customer-filled photo boxes.

## 0. Separate app, separate database — decided

The calendar store is built standalone: its own Supabase project, its own auth and payments, reusing the existing GCP PDF server and the existing AWS S3 buckets in Cape Town (af-south-1).

Why this is the right call (from the PrintStream snapshot): PrintStream is its own Supabase project (`kgizusgqexmlfcqfjopk`), ~120 tables of MIS — `production_jobs`, `job_stage_instances`, the scheduler, labels, tracker, Excel import. Its customer-order path (`pp_orders` → `pp_skus` → `pp_stage_templates` → `production_jobs`) is a B2B "order now, bill later" intake: no cart, no payments, no invoicing anywhere in that codebase. Putting a public shop inside a live scheduler would mean rebuilding all of that and exposing the MIS database to the internet.

No bridge is built now. It stays cheap to add later because the store will already hold the two things PrintStream needs: a stable order reference and a finished print-ready PDF path. A future push is one edge function inserting a `pp_orders` row against a `CALENDAR-*` SKU with `client_reference` = the store order number and `imposed_pdf_path` = the print-ready PDF. Nothing in this plan needs to change to enable that.


## 1. Remix and new backend

- Remix the project in Lovable (keeps all code: platform/tenant/branch tiers, cart, payments, quotes, PDF pipeline).
- Connect a **new external Supabase project** to the remix. The remix does not carry over data, so the schema must be recreated:
  - Export the current schema (tables, enums, functions, triggers, RLS, grants) and apply it to the new project as one baseline migration.
  - Re-add secrets (payment gateway, SMTP/email, PDF API, S3 keys, Turnstile) — none carry across.
  - Edge functions redeploy automatically against the new project.
- Seed **one tenant** with one branch, locale ZA/metric, and toggle every product family off except Calendars. Nothing else is deleted — other products stay in the codebase, just hidden.
- Keep the GCP PDF server at `api.document-centre.com`. It is shared, so add a per-project API key/allowlist so the calendar store authenticates separately from Document Centre.
- **Storage stays on the existing AWS S3 buckets in Cape Town (af-south-1)** via the current `s3-storage` edge function and signed-URL flow — no Supabase Storage buckets. Either a dedicated `calendars/` key prefix in the existing bucket or a new bucket, your call. Once the remix has its URL, you add it to the bucket CORS allowlist and (if you want isolation) issue an IAM user scoped to that prefix; the access key + secret go in as project secrets.


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
2. S3 wiring: CORS allowlist for the new URL, IAM keys, verify upload + signed download end to end.
3. Calendar template schema (templates, boxes) and admin CRUD.
4. Admin PDF box editor.
5. Customer calendar builder with live preview.
6. PDF server compose endpoint + wire into print-ready.
7. Branding, pricing, and go-live checks.


## Technical notes

- New tables: `calendar_templates` (tenant/branch scope, base PDF path, page count, trim size, status), `calendar_template_boxes` (template_id, name, x/y/w/h mm, fit mode, sort order), all with grants + RLS mirroring the existing catalogue tables.
- Order spec stored as `order_items.spec.calendar` with `template_id` and a `boxes[]` array of `{ box_id, document_id, storage_path, crop, zoom, rotation }` — same shape family as `CanvasPrintEntry`, so the tile/editor patterns port over.
- Preview compositing runs client-side on canvas from the rasterised template page + cropped images; production compositing runs server-side from the original PDF/images, never from the preview raster.
- Reuse `rasterisePdfPageOneToImage`, `DebouncedColorInput`, `ResolutionBadge`, and the QR mobile-upload flow as-is.
- All artwork (template PDFs, customer uploads, print-ready output) lives in af-south-1 S3 and is read through short-lived signed URLs, exactly as the current builders do — the new DB stores paths only.

- Bridge auth: shared secret held as a secret in both projects; the PrintStream receiver validates it in code and never accepts anonymous calls. Idempotent on `client_reference` so a retry cannot double-create a job.
