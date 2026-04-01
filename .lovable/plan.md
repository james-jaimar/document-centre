

# Plan: Enable Customer Cleanup of Draft Orders and Files

## Problem

Customers have no way to delete uploaded files from the file list, or delete/discard draft orders they no longer need. There are no delete buttons anywhere in the customer portal.

## Changes

### 1. Delete uploaded files — `FileList.tsx` + `OrderFiles.tsx`

Add a delete (trash) icon button on each file row in `FileList.tsx`:
- New `onDelete` callback prop `(docId: string) => Promise<void>`
- Small trash icon button next to the reprocess/status icons, only shown when file is ready
- Confirmation via a simple `window.confirm` or inline toast

In `OrderFiles.tsx`:
- Add `handleDeleteDocument` function that:
  1. Deletes associated `document_sections` referencing that document
  2. Deletes the `documents` row
  3. Removes the file from Supabase Storage (`document-uploads` bucket)
  4. Refetches documents and sections
- Pass it as `onDelete` to `FileList`

### 2. Delete draft orders — `CustomerOrders.tsx`

Add a delete button per row (trash icon) that only appears for **draft** orders:
- On click, confirm with the user
- Delete cascade: `document_sections` → `documents` → `order_items` → `orders`
- Also clean up files from Storage bucket
- Refetch orders after deletion

Add a "Clear All Drafts" button in the Drafts tab header for bulk cleanup.

### 3. Database: RLS already allows it

The existing RLS policies on `orders`, `order_items`, `documents`, and `document_sections` all grant full `ALL` access to `user_id = auth.uid()` (orders) or via the order ownership chain. No migration needed — the client can already delete these rows.

For Storage, the `document-uploads` bucket RLS allows owners to delete their own files.

## Technical detail

### Delete order cascade (client-side, in sequence):
```
1. supabase.from("document_sections").delete().in("document_id", docIds)
2. supabase.from("documents").delete().eq("order_item_id", itemId)
3. supabase.storage.from("document-uploads").remove(filePaths)
4. supabase.from("order_items").delete().eq("order_id", orderId)
5. supabase.from("orders").delete().eq("id", orderId)
```

### Files modified
- `src/components/order/FileList.tsx` — add `onDelete` prop & trash button
- `src/pages/dashboard/OrderFiles.tsx` — add delete document handler
- `src/pages/dashboard/CustomerOrders.tsx` — add delete draft order with confirmation dialog

### No database migration required

## Implementation order
1. Add file delete to FileList + OrderFiles
2. Add draft order delete to CustomerOrders

