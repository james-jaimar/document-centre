# Why the print-ready download "takes too long"

## What the check actually found

The regenerate at 07:12 UTC today did work — `print_ready_assembled_at` is
2026-08-29 07:12:04 and the job now points at a new file
(`.../a3bcc85b-….pdf`), with the new assembly report (Liberation Sans embedded,
trim/bleed geometry recorded). So the pipeline-version bump did its job.

Listing that object in S3 gives the real cause:

```text
a3bcc85b-….pdf   2026-08-29 07:11:54   292,731,867 bytes  (279 MB)
8b31d3dd-….pdf   2026-08-28 14:43:44   292,501,481 bytes  (279 MB)
```

The bucket is `jaimar-dev-…-af-south-1`. The download is not stuck — the browser
is genuinely pulling a **279 MB** file into memory as a Blob before it can
trigger the save. On anything slower than ~75 Mbit/s that cannot finish inside
the 30-second abort window I added yesterday, so it aborts and falls back to a
new tab (which the pop-up blocker then caught).

Two separate problems follow from that.

## Problem 1 — the download path is wrong for large files

Buffering the whole PDF through `fetch` → `Blob` → object URL is only sensible
for small artefacts. For a 279 MB file it is slow, memory-hungry, and pointless
because the presigned URL can be handed straight to the browser's own
downloader.

Fix in `src/components/orders/detail/ProductionPanel.tsx`:

- Ask `s3-storage` for the object size alongside the signed URL (or read it from
  a new `stat` action) and, above a threshold (~25 MB), skip `fetch` entirely:
  navigate to the signed URL with a hidden anchor so the browser streams it to
  disk with a real progress bar and no pop-up blocker involvement.
- Keep the blob path only for small files, and raise its abort timeout from 30 s
  to something realistic (120 s).
- Since the anchor navigation is same-tab, the pop-up blocker never fires. Only
  fall back to `window.open` if the anchor approach fails.
- Show the file size next to each download button so a 279 MB artefact is
  obvious before it is clicked.

Optionally have the sign call request a
`response-content-disposition=attachment; filename=…` on the presigned URL so a
direct navigation still downloads with the right filename rather than opening
inline in the PDF viewer.

## Problem 2 — 279 MB is far too big for this job

12 pages at 594 × 420 mm should not be 279 MB. The assembly report shows
`image_placeholders_filled: 2`, `under_layer_count: 1`, `over_layer_count: 2`,
so the size is almost certainly coming from the customer-supplied placeholder
images (and/or the base template PDF) being embedded at full uncompressed
resolution and repeated on every page.

Investigation steps, before changing anything:

1. Measure the base template PDF
   (`artwork-templates/7caff939-…/base.pdf`) and the two placeholder source
   images — establish which one dominates.
2. Check whether `templated_artwork_assembly.py` re-embeds the same image object
   per page instead of referencing one shared XObject.
3. Check the DPI the placeholder raster is rendered at; anything above 300 dpi
   at final trim size is wasted for print.

Then fix the dominant cause: share a single image XObject across pages,
downsample placeholder rasters to 300 dpi at placed size, and let the writer
compress streams. That should take the artefact from hundreds of MB to tens.

## Order of work

1. Fix the download UX (Problem 1) — quick, unblocks you today.
2. Investigate and report the file-size breakdown (Problem 2) before touching
   the assembly code, so the fix targets the real cause.

## Technical notes

- No timeout change alone will fix this; 279 MB over a typical link is minutes.
- The `s3-storage` edge function currently exposes `sign-download` (presigned
  URL) and `download` (proxy through the function). The proxy must **not** be
  used for these files — it would stream a 279 MB body through the edge runtime.
