# Multi-page PDF into the A2 deskpad: find the real fault, then fix it

## What the records actually show

Three attempts this morning, each in a fresh basket item (09:03, 09:17, 09:48) on the "Design 6" 12-page A2 deskpad template:

- 09:03 attempt: one picture landed (page 1 only), one uploaded file recorded.
- 09:17 and 09:48 attempts: the "different picture on every page" switch was saved as ON, but **zero** pictures were saved and **zero** files were recorded as uploaded.

So on the last two runs not a single page got as far as being stored — the progress bar showed "1 of 12" (which is what it shows before any page has finished) and then everything failed. No browser console history is available from those runs, so the exact failing step is not yet proven. This plan does not guess at it: step 1 is to reproduce it and capture the error.

## Step 1 — Reproduce and capture the failure

- Build a throwaway 12-page A2 test PDF and run the deskpad builder in a scripted browser session, uploading it into the header box with "same picture on every page" turned off.
- Capture the console errors, failed network calls and timings for each page, so the failing step (page rendering, image conversion, upload, or saving) is identified from evidence rather than assumption.

## Step 2 — Fix what the reproduction shows

Fix the confirmed cause. Alongside it, close the gaps that made this silent and unrecoverable:

- Show the real error text in the on-screen message instead of a generic "could not place" note, and keep a per-page result list (placed / failed) visible after the run.
- Make each page's work retry once automatically before it is counted as failed, and add a "Retry failed pages" button so the customer never has to start over.
- Save progress as pages land, rather than relying on the delayed background save, so a run that stops half way keeps what already succeeded.
- Keep the picture area locked while placing (already in place) and add a Cancel control so a stuck run can be abandoned cleanly.

## Step 3 — Fix the first-attempt behaviour

On the first run the pop-up ("use a different page on each of the 12 pages?") was accepted and nothing visibly happened. Replace the browser pop-up with an in-app dialog that names the file, the number of pages found and the two choices, and that hands straight over to the visible progress panel so there is never a dead pause after choosing.

## Step 4 — Verify

- Re-run the scripted 12-page upload and confirm 12 pictures are stored against the item, each tagged with its source page number.
- Confirm the saved basket item holds 12 per-page entries and that the customer proof shows a different header on each month.

## Technical notes

- Records inspected: `order_items.spec->templated_artwork` for the three items, `documents` rows per item, `artwork_template_placeholders` (per-page allowed, no shared field key) and `artwork_templates.page_count` (12) — the template configuration is correct, so the fault is in the runtime upload path.
- Code in scope: `src/pages/dashboard/TemplatedArtworkBuilder.tsx` (`handlePickFile` spread branch, `applyValue`, `setPerPage`, debounced persist), `src/lib/artworkTemplates/pdfPages.ts` (streamed `onPage` rasterisation) and `src/hooks/usePhotoUpload.ts` (returns `null` silently on several failure paths — a likely contributor to a run that reports nothing).
- Reproduction harness lives under `/tmp` only; no test files are added to the project.
