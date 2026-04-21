

## Fix: Invoice PDF Generation and Download

### Problem

Two issues prevent invoice PDFs from working:

1. **Demo orders are silently skipped** -- The `generate-invoice-pdf` edge function (line 244) returns `{ success: true, skipped: true }` for any order where `is_demo === true`. Since the "Try It Now" demo flow marks orders as demo, no invoices are ever generated for those users. The order-engine treats this as a success (no error), so nothing is logged or surfaced.

2. **Download uses Supabase Storage but invoices are never created** -- Since generation is skipped, the `order_invoices` table has no rows, and the "No invoices yet" empty state is all that's shown. The download mechanism itself (signed URL from the `documents` Supabase bucket) is correctly implemented but has nothing to serve.

### Fix

#### 1. Allow invoice generation for demo orders (`supabase/functions/generate-invoice-pdf/index.ts`)

Remove the early-return guard that skips demo orders. Demo invoices are harmless -- they exercise the full flow and show users the feature works. The invoice is stored in the `documents` bucket under a tenant-scoped path and recorded in `order_invoices`, so there's no data pollution.

Change line 244 from:
```
if ((order as any).is_demo) return json({ success: true, skipped: true, reason: "demo_order" });
```
to simply removing that check entirely, or gating it behind a separate "suppress invoices" tenant setting if desired. For now, removing the guard is the right call.

#### 2. Ensure the `generate-invoice-pdf` function is deployed

Deploy the updated function so it's active and reachable when `order-engine` calls `triggerInvoice()`.

#### 3. Validate the download path works end-to-end

The `downloadInvoice` function in `src/lib/orders/mutations.ts` uses `supabase.storage.from(storage_bucket).createSignedUrl(storage_path, 60)`. This works for the `documents` bucket (which is private). No code changes needed here -- once invoices are generated and stored, downloads will work.

#### 4. Add manual "Generate Invoice" for existing demo orders

Currently, clicking "Generate Invoice" in the admin order detail calls `order-engine` with action `generateInvoice`, which calls `triggerInvoice()`. With the demo guard removed, this will work for existing demo orders too -- admins can retroactively generate invoices.

### Files changed

- `supabase/functions/generate-invoice-pdf/index.ts` -- remove the `is_demo` early-return guard (line 244)

### Verification

1. Place a demo order via "Try It Now".
2. Check the admin order detail -- a proforma invoice should appear automatically (triggered by `createOrderWithJobs` side-effect).
3. Click "PDF" on the invoice row -- the browser should download the PDF.
4. Click "Generate Invoice" -- a tax invoice should be created and appear in the list.

