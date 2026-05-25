# Quote PDF — Fix filename, logo and layout

Comparing your freshly downloaded `Q-00002` against the PostNet `QTE382` reference exposed three concrete root causes. Plan below addresses each.

## 1. Filename uses UUID instead of quote number

Cause: in `src/hooks/useQuotes.ts` the popup-blocked fallback uses `Quote-${quoteId}.pdf`, and the primary path opens a blob URL which ignores the server's `Content-Disposition: filename="Quote-Q-00002.pdf"`.

Fix:
- Fetch the quote's `quote_number` from the local DB first, then label the blob.
- Set the `<a download>` and the blob navigation filename to `Quote-<quote_number>.pdf`.
- Read `Content-Disposition` from the response as a secondary source so the edge function remains the source of truth.

## 2. PostNet logo not appearing

Cause #1: edge function reads `tenants.settings.branding.logo_url` (a JSONB column), but real branding lives in the `tenant_settings` table (`category='branding'`, `setting_key='logo_url'`). The lookup returns nothing.

Cause #2: even when found, the stored asset is `logo.svg`. `pdf-lib` only embeds PNG/JPG, so the current code's SVG check silently drops it.

Fix:
- In `quote-pdf` resolve branding from `tenant_settings` (category=branding) first, fall back to `tenants.settings.branding` and `tenants.logo_url`. Also resolve `primary_color`, `portal_name` the same way.
- Add SVG support by rasterising via `@resvg/resvg-wasm` (esm.sh, Deno-compatible) at ~600px wide PNG before `embedPng`. Cache the rasterised bytes per `logoUrl` in-memory for the lifetime of the function instance.
- Add a small left-pad for the logo cell and shrink-to-fit so wide logos like PostNet's render cleanly.

## 3. Layout polish to match the PostNet sample

Issues found in `Q-00002.pdf`:

- "Line Total" header clipped at right edge → widen `total` column and right-pad table to inside the page margin.
- "Total R 1,577.00" shows a horizontal strike through the value → the brand-tinted label rectangle in `totalRow()` overruns the value cell; redraw it so the chip covers only the label column and the value sits in a clean right-aligned cell.
- "Item Code", "UnitPrice", "Vat%" headers look spaced strangely → these are Helvetica + the bold variant in the renderer (cosmetic, but) tighten with consistent spacing: "Item Code", "Unit Price", "Disc %", "VAT %".
- Bordered boxes (Quote From / Quote To / Deliver To) use a flat gray chip — switch chip fill to `brandSoft` (matches PostNet's blue tint) and use `dark` text for stronger contrast.
- Customer block only shows email. Render `customer_name`, `company_name`, billing address lines, `customer_phone`, `customer_vat_number` when present (all are optional fields on `quotes`; blank lines collapse).
- "Deliver To" currently duplicates the name. Show the order/quote delivery address when present; otherwise render a single muted line `Same as billing`.
- Metadata strip: page cell still says "1 of 1" hard-coded with a fragile late-patch. Render the page label per-page in the footer only and drop the strip cell to avoid the stale value.
- Footer: keep only one "Created: …" string (currently drawn twice — once via the helper and once raw).
- Disclaimer wrap calculation overshoots: compute starting `yd` from line count so it always sits above the page footer.

## Out of scope

- No schema changes, no Branding UI changes (PostNet's SVG will start working once SVG rasterisation lands).
- No barcode.
- No change to `send-quote-email`, stream-mode auth, or RLS.

## Files touched

- `supabase/functions/quote-pdf/index.ts` — branding resolution, SVG rasterisation, layout/totals/footer fixes.
- `src/hooks/useQuotes.ts` — filename uses `quote_number`.
