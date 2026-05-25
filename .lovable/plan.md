# Fix PDF filename + show quote number prominently

## Problems

1. **Filename reverts to a UUID** (e.g. `13840717-7bdd-4f39-ac29-91b79f8cc869.pdf`). Cause: `useDownloadQuotePdf` calls `window.open(blobUrl)` to pop the viewer tab. The PDF viewer in that tab cannot see the `Content-Disposition` header (blob URLs strip response headers), so the browser's "Save as" defaults to the blob's random UUID. Our auto-download `<a download>` does name the file correctly, but the user is saving from the viewer tab.

2. **Quote number not visibly on the PDF.** It appears only inside the small metadata strip ("Quote Number" column). The reference PostNet quote shows the number as a strong header beside/under the "QUOTE" title.

## Fix

### `supabase/functions/quote-pdf/index.ts`
- Add `Access-Control-Expose-Headers: Content-Disposition` to `corsHeaders` so the client hook can read the filename header (defensive, good hygiene).
- Under the existing "QUOTE" title (line 445), draw the quote number prominently, e.g. `Q-00003` at ~14pt bold in the brand colour, centered in the same `logoBoxW` column, a few points below the title.

### `src/hooks/useQuotes.ts` (`useDownloadQuotePdf`)
- Stop using `window.open(blobUrl)` for the viewer pop — that's what loses the filename. Instead, after creating the blob URL, open it in a new tab by setting `a.target = "_blank"` on the same anchor used for download, OR keep two behaviours but ensure the viewer tab uses a URL the browser will name correctly. Simplest reliable path: only trigger the named `<a download>` click and skip `window.open`, since the saved file is what the user actually wants named correctly. The PDF still opens in the OS PDF viewer after download on most browsers.
- Keep the existing `qRow.quote_number` fallback so `Quote-Q-XXXXX.pdf` is guaranteed even if the header isn't readable.

## Out of scope

No layout, totals, branding, or schema changes beyond the quote-number header line.

## Verification

Redeploy `quote-pdf`, click Download PDF on Q-00003:
- File saves as `Quote-Q-00003.pdf`.
- Rasterise page 1 at 150 DPI and confirm `Q-00003` appears prominently under the "QUOTE" title.
