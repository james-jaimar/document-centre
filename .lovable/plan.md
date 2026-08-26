# Templated artwork: find the admin screen, then build the GCP print-ready step

Two parts: (1) the layout editor already exists but is only reachable from one place, so make it findable; (2) the GCP PDF server step that turns a filled-in template into the print-ready PDF.

## 1. Where the template editor is today

The Artwork tab is rendered inside the product-family row on the **platform** products page (`/platform/products`) — expand a family with the chevron next to its name, then pick the **Artwork** tab (Catalogue / Variants / Options / Artwork).

The tenant products page at `/admin/products` is a different screen (master catalogue toggles + pricing) and has no Artwork tab, which is most likely why it looks missing.

Changes to make it obvious:

- Add an **Artwork** action button on the tenant `/admin/products` rows (same dialog pattern as Specs and Pricing), so templated families can be managed from the tenant side too.
- Show an "Artwork" badge/marker on families whose kind is `templated_artwork`, and only surface the Artwork tab/button for those families instead of on every family.
- Add a short empty-state line naming the required step order: set the family kind to **Templated artwork** → create a layout → upload the base PDF → draw boxes → publish.

## 2. GCP PDF server: compose the print-ready file

New assembler on the pdf-server, following exactly the canvas-prints pattern that already works:

- `app/services/templated_artwork_assembly.py` with `is_templated_artwork_job(bundle)` (matches `product_category = templated_artwork` or a `configuration.templated_artwork` object) and `assemble_templated_artwork(bundle, ws, job_number)`.
- Branch added in `app/tasks/production_tasks.py::assemble_print_ready_for_job`, after the canvas branch, with the same spec-hash caching, `write_artefact_path`, `assembly_report`, and `print_ready_spec_hash` bookkeeping.
- Composition logic: download the template base PDF from S3, and for every page stamp each placeholder into its mm box —
  - image placeholders: pull the customer's **original** upload (not the browser preview raster), apply fit/fill, zoom, offset and corner radius, resample to 300 DPI at box size, convert to CMYK;
  - text placeholders: draw the value with the admin's font, size, weight, colour and alignment using fonts already installed on the server so preview and print match.
- Bleed handled off the template's trim box; page geometry comes from the template record (`trim_width_mm`, `trim_height_mm`, `page_count`).
- Output is the full multi-page print-ready PDF written back to S3 and handed to the existing `enqueue-print-ready` / production-artefact path, so admin job screens and imposition need no change.

## 3. Verification before coding the assembler

- Confirm the customer spec actually lands on `order_jobs.configuration.templated_artwork` (it is written to `order_items.spec.templated_artwork`; the `handle_order_jobs_after_write` trigger must carry it across, same as `canvas_prints`). If it doesn't, extend that trigger first.
- Confirm the template's `base_pdf_path` and each placeholder's geometry are present in the saved spec, so the server never has to re-query the browser-side render.

## 4. Order of work

1. Admin discoverability fixes (tenant Artwork entry point, kind-gated tab, empty-state guidance).
2. Verify the spec reaches `order_jobs.configuration`; patch the trigger if needed.
3. Build the pdf-server assembler and wire the production-task branch.
4. Smoke test: fill a template, pay/enqueue, confirm the print-ready PDF is the right page count, size and CMYK.

Pricing for this product kind stays out of scope, as agreed.
