# Per-month artwork: repeat or different image on every page

Today a picture area on a calendar template takes one image and that image repeats on all 12 pages. This adds a per-picture-area switch so a customer can instead supply a different image for each month — and, when they have a single 12-page file, we split it across the months for them.

## What the customer sees

On each picture area that allows it, a small switch: **"Same picture on every page"** (on by default).

- **On** — exactly as it works now: one upload, repeated on all 12 pages.
- **Off** — the card expands into a per-month list (Page 1 … Page 12, using the page labels already shown in the strip). Each month has its own upload, crop, zoom, position and quality badge, and each month can also pull from the photo library. Months still empty are flagged before Add to cart if the area is required.
- Switching back to "same on every page" keeps the first month's picture and warns that the other months' pictures will be dropped.

### Multi-page upload

When per-month mode is on and the customer uploads a PDF with more than one page, we offer to spread it: page 1 to month 1, page 2 to month 2, and so on (extra pages ignored, short files leave later months empty). They can then replace any single month. A single-page file or an image just fills the month they dropped it on.

## What the admin sees

In the template box editor, each image box gains **"Allow a different picture per page"**. Off by default; when off the customer never sees the switch and the picture always repeats. Not offered for text or colour boxes.

## Order of work

1. Column on the placeholder table + admin toggle in the box editor.
2. Spec shape for per-page values, with the preview renderer resolving them.
3. Customer switch, per-month cards, and the multi-page split.
4. Proof modal, cart snapshot and admin proof view following the same resolution.
5. Print-ready composer on the PDF server.

## Technical notes

- **Schema**: `artwork_template_placeholders.allow_per_page_artwork boolean not null default false`. Existing RLS/grants unchanged.
- **Spec**: `TemplatedImageValue` gains `page_index?: number | null` (null/absent = applies to every page). `TemplatedArtworkSpec.placeholders` stays a flat array — per-month entries are extra records with the same `placeholder_id` and a set `page_index`. A `per_page` flag is recorded on the placeholder snapshot in `placeholder_defs` (already snapshotted at order time), so nothing else needs a new field.
- **Resolution helper** (new, in `src/lib/artworkTemplates/types.ts`): `valueForPlaceholderPage(values, placeholderId, pageIndex)` — exact page match first, then the page-agnostic entry, then the `field_key` sibling fallback already in `resolveValueFor`. Builder state moves from `Record<placeholderId, value>` to a keyed map `pid` / `pid@<page>`; `composeTemplatePage` and `ArtworkProofModal` take the same map and resolve by `pageIndex` (they already receive it).
- **Loaded images**: `placedImages` is keyed by placeholder id today; it becomes keyed by the same composite key so each month's bitmap is cached separately. `pinBlobPaths` list widens to all per-page paths.
- **Multi-page split**: reuse `rasterisePdfPages` (already imported in the builder) to rasterise every page for preview; each month's value keeps `source_pdf_path` plus its own page number so the server places the correct vector page 1:1. `TemplatedImageValue` gains `source_pdf_page?: number` for this.
- **PDF server** (`pdf-server/app/services/templated_artwork_assembly.py`): the `values` dict built at line ~753 becomes keyed by `(placeholder_id, page_index)` with a `None` page fallback; the per-page lookups at ~380 and ~898 pass the current `page_index`. Vector placement honours `source_pdf_page`. The "page 0 only" shortcuts around lines 857–898 must be dropped for placeholders in per-page mode, since their content now differs per page.
- **Admin proof** (`ArtworkAdminProof.tsx`) and `proofPdf.ts` use the same resolver, so no snapshot migration is needed — orders placed before this change have no `page_index` on any value and resolve exactly as they do today.
