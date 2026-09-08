# Fix the 12-page upload into a per-page picture area

## What the records show

Two attempts exist on the calendar item for the "Client Image (574x100mm)" area:

- 09:05 — the picture was saved with the file name `...page1.png` and a stored
  source file ending `-all-source.pdf`. The `all` marker is only written when the
  upload happens while **"Same picture on every page" is still on**, so that
  attempt never entered the multi-page split at all.
- 09:17 — the switch was off (the area is recorded in the per-page list), and the
  saved artwork list is **empty**: not one of the 12 pages was stored. So the
  split did start and then failed part-way, leaving nothing behind.

The split is currently all-or-nothing: it renders all 12 A2 pages at 2000px into
memory first, then uploads them one by one, and any single failure throws out the
whole batch with only a generic "Upload failed" message. That matches an empty
result with no clear explanation.

## What changes

1. **Place each page as it is ready, not at the end**
   Render page 1, upload it, put it on month 1, then move to page 2. A page that
   fails no longer discards the pages that already succeeded; the customer is
   told exactly which months could not be filled and can retry just those.

2. **Lower the memory ceiling**
   Pages are rendered one at a time and released immediately, at a resolution
   sized to the picture area rather than a flat 2000px. A2-wide strips no longer
   hold twelve full-size canvases at once.

3. **Split even when the switch is still on**
   If a multi-page PDF is dropped on an area that allows per-page pictures, the
   customer is asked: "This file has 12 pages — use a different page for each
   month?" Choosing yes turns the switch off automatically and spreads the file.
   Choosing no keeps today's behaviour (page 1, repeated).

4. **Hold the preview still while pages are placed**
   A progress overlay ("Placing page 4 of 12…") covers the stage; the page pager,
   the layout picker and the other picture cards are disabled until it finishes,
   so flicking through months cannot interrupt the run. The overlay clears itself
   on success or failure, and closing the tab mid-run leaves whatever was already
   placed intact.

5. **Real error messages**
   Each failure is logged with the page number and the reason, and the toast says
   which pages did not go through instead of "Upload failed".

## Technical notes

- `handlePickFile` in `src/pages/dashboard/TemplatedArtworkBuilder.tsx`: replace
  the batch loop (lines ~577-601) with a sequential per-page routine driven by a
  new `onPage` callback option on `rasterisePdfPages`
  (`src/lib/artworkTemplates/pdfPages.ts`), so each rendered page is handed back
  and its canvas dropped before the next is rendered.
- Multi-page detection needs the page count before the raster loop; read it from
  `pdfjs` `doc.numPages` via a small `pdfPageCount(file)` helper in `pdfPages.ts`
  and use it for both the confirmation prompt and the progress total.
- The per-page source PDF path currently bakes `page ?? "all"` into the key; upload
  the original once per placeholder (`-source.pdf`) and let each value carry its
  own `source_pdf_page`, so the server still places the correct vector page.
- New builder state `placingPages: { done: number; total: number } | null` gates the
  pager buttons, the template picker and the rail cards, and renders the overlay
  over the stage canvas.
- Values are written with the existing `applyValue(ph, value, pageIndex)`, so the
  spec shape, proofs and the Python composer are unchanged.

## Verification

Open an A2 deskpad layout, switch off "Same picture on every page", upload the
12-page header PDF, and confirm the overlay counts up, the pager is locked, and
all 12 months carry their own page afterwards — checked in the preview and in the
saved artwork list on the order item.
