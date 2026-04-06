

# Plan: Fix "Recently Uploaded Files" to Show Individual Files, Not Whole Orders

## Problem
"Recently Uploaded Files" currently lists **orders** (which may contain multiple documents). Clicking "Create" passes `?from=<orderId>`, which copies **all** documents from that order into the new one. That's why selecting "Booklet" produced 4 files — the source order had 4 documents.

## Solution
Change the "Recently Uploaded Files" section to list individual **documents** instead of orders. Pass the specific document ID (not order ID) when cloning.

### `src/pages/dashboard/CustomerDashboard.tsx`
1. Replace `useRecentOrders` with a new `useRecentDocuments` query that fetches from the `documents` table directly (joined to `order_items` to get tenant context), limited to the current user's documents, ordered by `created_at desc`, limit 5
2. Each row shows the document's `file_name`, page count, and upload date
3. "Create" popover passes `?fromDoc=<documentId>` instead of `?from=<orderId>`

### `src/pages/dashboard/OrderFiles.tsx`
1. Read `fromDoc` query param instead of `from`
2. In the copy effect, fetch the single source document by ID
3. Clone just that one document into the new order item
4. Clear `fromDoc` after copy

### Query for recent documents
```sql
SELECT d.* FROM documents d
JOIN order_items oi ON oi.id = d.order_item_id
JOIN orders o ON o.id = oi.order_id
WHERE o.user_id = :userId
ORDER BY d.created_at DESC
LIMIT 5
```

This ensures each row = one file, and "Create" copies exactly that one file.

