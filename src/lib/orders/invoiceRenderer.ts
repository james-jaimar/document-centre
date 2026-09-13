/**
 * Current invoice / proforma PDF layout version.
 *
 * BUMP THIS whenever the invoice layout or wording changes in
 * `supabase/functions/generate-invoice-pdf/index.ts` (keep the RENDERER_VERSION
 * constant there in sync). Stored PDFs stamped with a lower version — or with
 * no version at all — are treated as stale and re-rendered on next view,
 * download or email.
 *
 * v2 — hide VAT column/row when tax is disabled; proforma terms reworded.
 */
export const CURRENT_INVOICE_RENDERER_VERSION = 2;
