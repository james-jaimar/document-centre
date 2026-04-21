
## Fix PDF delivery so the app controls access URLs

### Problem
The current invoice/document download flow is wrong in two ways:

1. It generates the download URL in the browser with `supabase.storage.createSignedUrl(...)`, so the user sees a direct `*.supabase.co/storage/...` URL.
2. That direct storage URL is being blocked in your browser (`ERR_BLOCKED_BY_CLIENT`), which is why the PDF still fails even though the signing request succeeds.

The screenshot confirms this is not a generation failure anymore; it is a delivery/access pattern problem.

---

## What will be built

### 1. Replace direct Supabase storage downloads with an app-controlled document endpoint
Create a new secure Edge Function dedicated to document access, for example:

- `supabase/functions/document-access/index.ts`

This function will:
- authenticate the current user with `supabase.auth.getUser()`
- verify they are allowed to read the requested invoice/document
- look up the document record from `order_invoices` or `order_documents`
- fetch the file server-side using the service role
- return either:
  - a streamed PDF response, or
  - a short-lived signed URL only as a server-side implementation detail

Preferred approach: stream/file proxy response from the function, so the browser hits:
- `/functions/v1/document-access?...`

instead of:
- `https://<project>.supabase.co/storage/v1/object/...`

That keeps the visible document URL app-controlled.

### 2. Update all invoice PDF buttons to use the new server-mediated flow
Replace `downloadInvoice()` in:
- `src/lib/orders/mutations.ts`

So it no longer calls:
- `supabase.storage.from(bucket).createSignedUrl(...)`

Instead it will call the new `document-access` function and either:
- open a blob URL generated from the response, or
- navigate to an app-owned function URL that returns the PDF stream with proper headers.

This same change will automatically fix:
- `src/components/orders/OrderInvoicesList.tsx`
- `src/pages/admin/AdminDocuments.tsx`

because both already route through `downloadInvoice()`.

### 3. Fix customer order document links that still rely on raw/public URLs
There is another exposure point in:
- `src/pages/dashboard/CustomerOrderDetail.tsx`

Right now it renders:
- `doc.public_url`

That should be replaced with the same secure access method:
- use document ID / storage path through `document-access`
- never render raw storage URLs into the DOM for private PDFs

### 4. Unify document access for all administrative PDFs
The new secure flow should cover all tenant/admin-facing generated documents, not just invoices:
- proformas
- tax invoices
- credit notes
- receipts
- any file in `order_documents` stored in the private `documents` bucket

This creates one consistent rule:
- private documents are always opened through app-controlled access
- browser never gets a naked Supabase storage path as the primary user-visible URL

### 5. Add a document viewer action in the admin area
Extend the new Admin Documents area so staff can:
- view PDF inline
- download PDF
- jump to the related order

A simple first version:
- add “View” and “Download” actions in `src/pages/admin/AdminDocuments.tsx`
- both actions go through the secure document access path
- “View” opens a PDF tab from the function response
- “Download” forces attachment headers

### 6. Prepare the admin area for amend/edit workflows
For “ammend/edit admin pdf’s”, phase 1 should be structured so we can support it cleanly:
- keep generated PDFs as managed system documents
- add a clear distinction between:
  - generated system PDFs
  - replacement/manual upload PDFs
- add metadata/status fields in the UI to show whether a file is original or replaced

Implementation-ready next step after secure delivery:
- “Replace PDF” action in Admin Documents
- upload revised PDF to private storage
- update the `order_documents` / `order_invoices` reference
- retain auditability instead of editing PDF bytes in place

That is safer than trying to do in-browser PDF editing first.

---

## Files to change

### New
- `supabase/functions/document-access/index.ts`

### Update
- `src/lib/orders/mutations.ts`
- `src/components/orders/OrderInvoicesList.tsx`
- `src/pages/admin/AdminDocuments.tsx`
- `src/pages/dashboard/CustomerOrderDetail.tsx`

### Possibly update
- `src/lib/orders/queries.ts` if the UI needs stronger typed fields for secure access actions
- `src/lib/orders/types.ts` if adding a shared document access shape
- `src/components/orders/detail/JobDetailPanel.tsx` if document open/download actions are added there too

---

## Security and access rules

The new function should:
- accept a document/invoice ID, not just an arbitrary path
- verify the current user can access the related order
- use existing tenant/order access rules already enforced by:
  - `user_can_read_order(...)`
  - `user_is_staff_for(...)`

That avoids creating a path-based file oracle.

Recommended lookup model:
- query `order_documents` or `order_invoices`
- join back to the related `orders` row
- validate read permission
- only then return the PDF stream

---

## Important scope note

If the goal is specifically:

“clients can never see the Supabase URL etc.”

then this plan will fully fix that for private document/PDF delivery.

However, the app as a whole is still a client-side Supabase app:
- `src/integrations/supabase/client.ts` uses `VITE_SUPABASE_URL`
- browser requests to Supabase auth/database/functions will still exist in DevTools

So there are two levels:

1. **Document security / user-facing URL control**  
   This plan fixes that now.

2. **Hide Supabase from the entire frontend application**  
   That would require a broader architecture shift away from direct browser Supabase usage and toward a backend-for-frontend pattern. That is a much larger refactor and not necessary to solve the PDF problem.

---

## Why this fixes the current failure

The current failing route is:
```text
browser -> supabase storage signed URL -> blocked by client/extension
```

The new route becomes:
```text
browser -> app-controlled edge function -> validated server-side fetch -> PDF response
```

That removes the exposed storage URL from the user flow and avoids the browser hitting the blocked storage endpoint directly.

---

## Implementation order

1. Build `document-access` Edge Function
2. Switch `downloadInvoice()` to the new function
3. Update Admin Documents and order invoice lists
4. Replace `doc.public_url` usage in customer order detail
5. Add admin “View PDF” alongside “Download”
6. Prepare “Replace PDF” admin workflow as the next phase

---

## Technical details

### Current broken code
- `src/lib/orders/mutations.ts`
  - uses `supabase.storage.from(storage_bucket).createSignedUrl(storage_path, 60)`
- `src/pages/dashboard/CustomerOrderDetail.tsx`
  - uses `doc.public_url`

### Safer target pattern
- Browser calls `supabase.functions.invoke("document-access", { ... })`
- Function validates access and returns the file
- Frontend opens blob/object URL or function stream response
- No direct storage URL is used in UI actions

### Database/storage posture
The existing storage policy on `documents` can remain, but once server-mediated delivery is in place, document downloads should no longer depend on client-side storage signing.

That reduces exposure and gives you a single enforcement point for private PDFs.
