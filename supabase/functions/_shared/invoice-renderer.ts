/**
 * Current invoice / proforma PDF layout version.
 *
 * BUMP THIS whenever the invoice layout or wording changes in
 * `generate-invoice-pdf`. Stored PDFs stamped with a lower version — or with no
 * version at all — are treated as stale and re-rendered on next view, download
 * or email. Keep in sync with CURRENT_INVOICE_RENDERER_VERSION in
 * src/lib/orders/invoiceRenderer.ts.
 *
 * v2 — hide VAT column/row when tax is disabled; proforma terms reworded.
 * v3 — fall back to the tenant's branch for seller details when the order has none.
 */
export const INVOICE_RENDERER_VERSION = 3;
