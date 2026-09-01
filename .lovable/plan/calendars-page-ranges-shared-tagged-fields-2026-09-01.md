# Calendars: page ranges + shared "tagged" fields

Two changes to the artwork template engine, which together solve the calendar case: upload the logo once, place it on the cover in one spot and on pages 2–13 in another.

## 1. Which pages a box appears on

Today a box is either "all pages" or "one page". Add a third scope: **specific pages**, entered as a range list like `2-13` or `1,3,5-7` (1-based in the UI, stored 0-based).

- Admin editor scope selector becomes: All pages / This page only / Pages…
- With "Pages…" a text field takes the range, validated against the template page count, with a live "appears on 12 pages" hint.
- Box list badges show `p1`, `p2-13`, or `all`.
- Customer builder, proof modal, admin proof and the PDF proof all use the same filter, so a box only shows on the pages it belongs to.

## 2. Tagged (shared) fields

Give each placeholder an optional **field key** (e.g. `logo`). Boxes that share a key share one customer value.

- Admin: a "Shared field key" input on the box panel, with a dropdown of keys already used in this template so you can reuse rather than retype. Blank = the box behaves exactly as today (its own upload).
- Customer builder: keys collapse into a single entry in the rail — "Logo" uploaded once, with a note listing where it appears ("cover and monthly pages"). Editing it updates every box using that key, in each box's own position, fit and size.
- Required/DPI checks run per box (a small cover box and a large page box can warn differently) but the upload itself is one.
- Proofs and the production PDF resolve the same way, so what the customer sees is what prints.

Cover art placed on the cover box only, plus a `logo` box on the cover and another `logo` box scoped to pages 2–13, gives exactly the behaviour you described.

## Technical section

1. **Migration** on `public.artwork_template_placeholders`:
   - `page_indexes integer[]` (null unless scope is `pages`)
   - `field_key text` (nullable), index on `(template_id, field_key)`
   - widen the `page_scope` check to `('all','page','pages')`. Columns only — no grant/RLS change.
2. **Types** (`src/lib/artworkTemplates/types.ts`): add `page_indexes`, `field_key`; extend `PlaceholderPageScope`; update `placeholdersForPage` to honour `pages`; add `parsePageRange`/`formatPageRange` helpers and `resolveValueFor(placeholder, values, defs)` that falls back to the first value belonging to a box with the same `field_key`.
3. **Hook** (`src/hooks/useArtworkTemplates.ts`): map/persist the two new columns in `asPlaceholder` and the save mutation.
4. **Admin editor** (`TemplateBoxEditor.tsx`): scope selector third option + range input + validation; shared-key input with datalist of existing keys; badge rendering.
5. **Renderer** (`renderTemplate.ts`): look values up through `resolveValueFor` instead of `opts.values[p.id]` — one change covers builder canvas, proof modal, admin proof and `proofPdf.ts`.
6. **Builder** (`TemplatedArtworkBuilder.tsx`): group rail entries by `field_key || id`; write the uploaded value once per key but emit one spec entry per placeholder id on save, so `order_items.spec.templated_artwork.placeholders` keeps its current shape and no order/PDF contract changes. `placeholder_defs` carries the new fields.
7. **PDF server** (`templated_artwork_assembly.py`): `_def_on_page` handles `pages` via `page_indexes`; value lookup unchanged because the spec still holds one entry per box.
8. **Regression**: existing deskpad templates (all `all` scope, no keys) render byte-identically; a 13-page calendar renders cover logo and monthly logo from a single upload.
