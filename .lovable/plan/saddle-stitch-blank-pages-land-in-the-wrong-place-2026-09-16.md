# Saddle-stitch: blank pages land in the wrong place

## What is wrong

On the build page for the SEESA OHS booklet the pages are assembled in this order:

```text
front cover (2)  +  body (69)  +  back cover (2)   = 73 faces
then 3 blanks are added at the very END              = 76 faces
```

So the booklet reads: cover, body, back cover, then three loose blank pages after the
back cover. That is why the document appears to end, a blank shows up, and the back
cover sits in the wrong position.

Verified from the live record (order `c6fc2ac4…`): three sections — body 69 pages,
front cover pages 1-2 of a 4-page file, back cover 2 pages, all double-sided; the
product family is "Saddle stitched Booklets", so the booklet rule does apply.

## What it should be

A saddle-stitched booklet is folded sheets of 4 faces. The cover is its own folded
sheet (outside front, inside front, inside back, outside back). The body must reach a
multiple of 4 **on its own**, and any blanks belong at the **end of the body**, before
the back cover:

```text
front cover (2) + body 69 → padded to 72 + back cover (2) = 76
pages 75 and 76 are inside-back and back cover
```

## Changes

1. **Page builder on the build page** (`src/components/order/PreviewPanel.tsx`)
   Move the booklet padding out of the end-of-sequence step. Count only the body
   faces (everything that is not a front-cover or back-cover section), pad those up
   to a multiple of 4, and insert the blanks immediately after the last body face —
   before the back cover. Blanks keep the existing "blank" role so they are labelled
   as blanks and never counted as printed pages.

2. **Saved preview snapshot** (`src/lib/orders/buildPreviewSnapshot.ts`)
   Identical change, so a placed order's stored preview matches what the customer
   approved on the build page. Extend `src/lib/orders/buildPreviewSnapshot.test.ts`
   with a 69-body + 2-page-cover + 2-page-back-cover case asserting 76 faces and the
   back cover on faces 75-76.

3. **Print assembly** (`src/lib/orders/buildJobSnapshot.ts`)
   The merge directives currently insert real blank pages only for single-page
   covers, so the printed file would not carry the body padding and the press-side
   booklet step would pad at the end — the same misplacement, in print. Add
   `blank_page` directives with reason `booklet_pad` at the end of the body for
   saddle-stitched jobs, so the merged PDF matches the preview page for page.

## Notes

- Presentation and assembly only: no database, pricing or edge-function changes.
- Booklets whose body is already a multiple of 4 are unaffected.
- Page numbering, tab/insert alignment and the existing cover-blank rules stay as they are.
