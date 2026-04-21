
## Fix: "Create from recently uploaded file" should actually carry the file into the new session

### Root cause

The dashboard is passing `?fromDoc={doc.id}` correctly when the user picks a product from "Recently Uploaded Files".

The break happens inside `OrderFiles.tsx`:

- the `fromDoc` effect starts
- `ensureOrder()` creates the draft order
- `ensureOrder()` immediately navigates to `/t/:slug/orders/{orderId}/files`
- that route change drops the `?fromDoc=` query param and remounts the screen before the clone flow has safely completed

So the user lands in a brand-new order session with no copied document.

### Fix

### 1. Stop redirecting too early during the clone flow
File: `src/pages/dashboard/OrderFiles.tsx`

Refactor `ensureOrder()` so it can create the order/item without immediately navigating away.

Recommended shape:

- keep `setCreatedOrderId(order.id)` so the current screen can already work against the new order
- add an option like `ensureOrder({ navigateToCanonicalUrl?: boolean })`
- default normal uploads to `true`
- call it from the `fromDoc` copy flow with `false`

That keeps the user on the `orders/new/:familyId?fromDoc=...` route long enough for the copy and DB insert to complete reliably.

### 2. Navigate only after the document clone succeeds
File: `src/pages/dashboard/OrderFiles.tsx`

In the `fromDoc` effect:

1. validate the source document
2. create the new order/item without redirecting
3. copy the S3 object to the new `order-items/{newItemId}/...` path
4. insert the cloned `documents` row
5. invalidate/refetch the new order’s documents
6. clear `fromDoc`
7. only then replace the URL to `/t/${slug}/orders/${order.id}/files`

This makes the canonical route update the final step, not the first step.

### 3. Preserve the normal lazy-create flow for regular uploads
File: `src/pages/dashboard/OrderFiles.tsx`

The normal uploader path still needs current behavior:

- user selects a product
- first real upload creates the order
- then the screen can move to the canonical `/orders/{id}/files` URL

So the redirect suppression must be scoped only to the recent-upload clone path, not to all order creation.

### 4. Tighten post-copy refresh logic
File: `src/pages/dashboard/OrderFiles.tsx`

After the cloned document row is inserted:

- invalidate the `["documents", newItemId]` query explicitly
- keep `refetchDocuments()` for the live screen
- keep `invalidateUserOrderCaches(qc)` so the dashboard tiles update correctly

This ensures the file list populates immediately after the copy succeeds.

### Why this approach
This fixes the actual race instead of masking it:

- the dashboard link is already correct
- the S3 copy helper is already wired
- the broken part is the premature route replacement during an in-flight clone

### Files changed

- `src/pages/dashboard/OrderFiles.tsx`
  - refactor `ensureOrder()` to support no-redirect mode
  - update the `fromDoc` auto-copy effect to finish cloning before navigation
  - explicitly invalidate the new item’s documents query after insert

### Verification

1. Open Print Centre dashboard.
2. In "Recently Uploaded Files", click `Create`.
3. Choose a product, e.g. `Bound Documents`.
4. The new order session opens with the selected file already present in the file list.
5. Refresh the page: the file is still there.
6. Confirm the URL ends on `/t/demo/orders/{newOrderId}/files`, without `?fromDoc=`.
7. Normal manual upload flow still works and still creates the draft lazily on first upload.
