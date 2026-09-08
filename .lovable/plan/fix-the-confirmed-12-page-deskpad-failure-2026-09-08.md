# Fix the confirmed 12-page deskpad failure

## Confirmed cause

The supplied browser log identifies the exact failure. All 12 PDF pages rasterised, but `TemplatedArtworkBuilder.tsx` then called `fetch(rp.dataUrl)` to turn each in-memory PNG into a file. On the published site, the Content Security Policy correctly does not permit `data:` under `connect-src`, so the browser blocked every one of those fetches before any upload began.

This also explains the screenshot exactly: all 12 pages were processed, all 12 failed at the same conversion line, and the customer-facing progress text incorrectly described processed pages as “added”.

## Changes

1. **Remove the blocked network-style conversion**
   - Convert each rasterised PNG data URL directly into a `Blob`/`File` in memory, without `fetch` and without any network request.
   - Keep the existing sequential page rendering and upload path so memory stays bounded and successful pages are retained.
   - Do not weaken the site security policy by adding `data:` to `connect-src`.

2. **Make progress truthful**
   - Track processed, successfully placed and failed pages separately.
   - During the run, show “X of 12 processed” plus the placed/failed counts rather than saying failed pages were added.
   - When every page fails, skip the misleading saving/success state and show one clear summary instead of 12 repetitive notices plus a final duplicate notice.

3. **Preserve recovery behaviour**
   - Keep the page controls locked while placement is running.
   - Keep the automatic one-time upload retry for genuine upload failures.
   - Preserve any pages that succeed and save them immediately; cancellation must report only the pages actually completed.

## Verification

- Run the supplied `CLS_Deskpad_2027.pdf` through the same 12-page placement path under a Content Security Policy matching production.
- Confirm there are no `fetch(data:image/...)` calls or CSP violations.
- Confirm all 12 page files upload, all 12 per-page artwork values are saved with source PDF page numbers 1–12, and each month shows its matching header.
- Confirm the overlay remains locked throughout and reports accurate processed, placed and failed totals.
- Run the TypeScript check and a browser regression for the single-page/repeat option.

## Technical scope

- Primary file: `src/pages/dashboard/TemplatedArtworkBuilder.tsx`.
- Add a small local, CSP-safe data-URL-to-blob conversion helper or expose the rendered PNG blob from `src/lib/artworkTemplates/pdfPages.ts`; use the smaller change that avoids altering unrelated preview consumers.
- No database, S3 policy or Content Security Policy change is required for this confirmed fault.