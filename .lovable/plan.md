
# Admin / Branch Quote Mode (no artwork required)

Goal: let admin and branch staff build a real, priced quote for a customer **before** any artwork is uploaded, using the same product configurator and pricing engine as a normal order. When the customer later uploads real artwork, the system re-prices and shows any diff vs the original quote.

## 1. Configurator "Quote mode" entry

- Replace the current blank-line-item flow on `AdminQuoteCreate.tsx` (and add the equivalent under Branch → Quotes → New) with a proper configurator flow:
  1. Pick customer (email + optional profile match, same as today).
  2. Pick product family (Flyers, Booklet, etc.).
  3. Open the standard `OrderBuild` configurator in **quote mode** — no upload required.
- In quote mode the configurator:
  - Hides the file upload / preview panels.
  - Shows spec inputs directly: size, orientation, page count (for booklets), quantity, colour, sides, paper, finishing, pack (for Flyers).
  - Runs the exact same pricing pipeline (`calculatePrice`, pack ladder, options) so the quoted total = what a real order would cost.

## 2. Synthetic document stub

To avoid forking the pricing engine, quote mode injects a synthetic document behind the scenes:
- One `document` row flagged `is_synthetic = true` (new boolean column on `documents`).
- One `document_section` matching the entered specs (page count, colour, duplex, size).
- No real PDF, no storage upload, no preflight run.
- Preview panel replaced with a "Quote — no artwork yet" placeholder.

This means all existing hooks (`useOrderData`, options panel, price summary, pack ladder) work unchanged.

## 3. Persistence as a quote

- Reuse existing `quotes` + `quote_items` tables.
- On "Save quote": snapshot the configured spec into `quote_items.configuration` (jsonb) and `quote_items.product_snapshot`, along with `product_family_id`, unit/net/gross prices, and quantity — same shape the order engine already produces.
- Set `created_via = 'tenant_sales'` (admin) or `'branch_sales'` (branch).
- Email the customer the standard quote link (existing flow).

## 4. Customer uploads artwork against a quote

On `CustomerQuoteDetail.tsx`:
- If any quote item has no real artwork, show an "Upload artwork" CTA per line item.
- Upload flow reuses the standard `useDocumentUpload` + preflight pipeline, attached to a **draft order** cloned from the quote item's snapshot (lazy order creation, same as today).
- After upload + preflight, re-run pricing on the real spec:
  - Detected page count, actual size, orientation, colour usage.
- Compare vs quoted spec and show a diff panel:
  - Green rows = match.
  - Amber rows = changed (e.g. quoted 24pp, uploaded 28pp).
  - New total vs quoted total, with delta.
- Customer can Accept new price → converts quote to order, or Reject → keeps quote open for revision.

## 5. Admin conversion path

- On `AdminQuoteDetail.tsx` / `BranchQuoteDetail.tsx`:
  - "Convert to order" button, enabled once artwork is attached (or if admin chooses to force-convert without artwork for offline jobs).
  - Sets `quotes.converted_order_id` and `converted_at`; creates the order via existing engine using the snapshotted config.

## 6. Repricing logic

Central helper `repriceQuoteItemFromArtwork(quoteItemId, realSpec)`:
- Loads quote item's stored config.
- Merges real spec (page count, size, orientation, sides inferred from doc).
- Runs the same `calculatePrice` used by the configurator.
- Returns `{ oldTotal, newTotal, diffs: [{field, from, to}], newConfig }`.

## Technical details

- **DB migration**:
  - `ALTER TABLE documents ADD COLUMN is_synthetic boolean NOT NULL DEFAULT false;`
  - Optional: `quote_items.is_synthetic_spec boolean` for fast filtering.
  - No new tables — reuse `quotes`, `quote_items`, `documents`, `document_sections`.
- **New hook**: `useCreateQuoteFromSpec` — wraps synthetic-doc creation + `quote_items` insert.
- **New hook**: `useRepriceQuoteItem` — used on customer artwork upload.
- **Configurator changes**: add `mode: 'order' | 'quote'` prop threaded through `OrderBuild`, `OptionsPanel`, `PriceSummary`, `PreviewPanel`, `OrderFiles`. In quote mode, upload/preflight steps are bypassed and preview shows a placeholder.
- **Routing**:
  - Admin: `/admin/quotes/new` → product picker → `/admin/quotes/new/:familyId` (configurator).
  - Branch: mirror under `/branch/quotes/new`.
  - Customer: existing `/t/:slug/quotes/:id` gains upload + repricing UI.
- **Emails**: reuse existing quote-sent template; add a second template for "quote repriced after artwork" when the delta is non-zero.
- **Guards**: quote creation gated by `tenant_membership` role (Sales/Admin/Owner at tenant; same at branch).

## Out of scope for this pass

- Multi-item quotes with different products in one quote (v1 = one item per quote; add-more later).
- Automatic quote expiry emails (already covered by nudges plan).
- PDF quote generation (already exists via `pdf_storage_path` — untouched).
