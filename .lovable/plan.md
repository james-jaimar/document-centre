# Calendars: per-page placeholder boxes

Today every placeholder box (image, text, colour) on an artwork template is repeated on **every** page of the base PDF — that is how deskpads work, and it is confirmed in the schema (`artwork_template_placeholders` has no page column), in the customer builder (one value per box, drawn on all pages) and in the PDF server (the same box list is stamped onto every page).

Calendars need the same template engine, but with a 13-page base PDF (cover + 12 months) where each box is either **on this page only** or **repeated on all pages**.

## What changes for you

**Admin template editor**
- Page navigator (thumbnail strip / prev-next) so you draw boxes on the cover, on January, on February, and so on.
- Every box gets a scope control: **This page only** or **All pages**.
- The canvas shows boxes belonging to the current page plus all repeating boxes (repeating ones marked with a small "all pages" badge so you can tell them apart).
- "Duplicate to page…" and "Copy boxes from page…" so you can lay out one month and reuse it.
- Box list in the side rail groups into "Repeats on all pages" and "Page N only".

**Customer builder**
- The placeholder rail follows the page you are viewing: repeating boxes stay pinned at the top ("appears on every page"), page-specific boxes appear under a "Page N" heading.
- Page pager already exists; it now also drives which boxes are editable.
- Required-field validation is per page, and the "not finished yet" hint names the page.
- Live preview draws only the boxes that belong to the page on screen.

**Print output**
- The PDF server stamps each page with its own boxes plus the repeating ones. Deskpads and existing templates are unaffected.

## Technical section

1. **Schema migration** on `public.artwork_template_placeholders`:
   - `page_scope text NOT NULL DEFAULT 'all' CHECK (page_scope IN ('all','page'))`
   - `page_index integer` (0-based; NULL when scope is `all`)
   - index on `(template_id, page_index)`. No grant/RLS changes needed (columns only).
   - Existing rows default to `all`, so deskpad templates behave exactly as now.

2. **Types** (`src/lib/artworkTemplates/types.ts`): add `page_scope` and `page_index` to `ArtworkPlaceholder`; add a helper `placeholdersForPage(list, pageIndex)` that returns repeating + page-matched boxes in draw order (reusing `splitByLayer`).

3. **Compositing** (`renderTemplate.ts`): `ComposeOptions` gains `pageIndex`; callers pass the filtered list, so `composeTemplatePage` itself needs only the filtered input. Proof export (`proofPdf.ts`) filters per page as it loops.

4. **Admin editor** (`src/components/artwork/TemplateBoxEditor.tsx`, `PlaceholderPanel.tsx`): add page state, page thumbnails, scope selector, duplicate/copy-to-page actions, and write `page_scope`/`page_index` on insert and update. New boxes default to the current page (`page` scope) when the template has more than one page, `all` when it has one.

5. **Customer builder** (`src/pages/dashboard/TemplatedArtworkBuilder.tsx`): filter the rail and the canvas by the active page; keep values keyed by placeholder id (unchanged, since each box is a distinct row); validation and the DPI badges follow the filtered set. Placeholder ids stay unique, so `order_items.spec.templated_artwork.placeholders` needs no shape change — only `placeholder_defs` now carries the new fields.

6. **PDF server** (`pdf-server/app/services/templated_artwork_assembly.py`): in the existing `for page_index, page in enumerate(reader.pages)` loop, pass `defs` filtered to `page_scope == 'all' or page_index == d['page_index']` into the overlay/underlay builders. Defs without the new keys keep the current behaviour.

7. **Regression check**: an existing A2 deskpad template still renders identically (all boxes `all` scope), and a 13-page calendar renders cover-only and month-only boxes on the right pages.

Not in this step: pricing, the calendar product family itself, and month-name auto-fill — say the word and they follow.
