

# Plan: Pass Uploaded File Through "Create" Flow

## Problem
When clicking "Create" on a recently uploaded file and selecting a product, the navigation goes to `/t/:slug/orders/new/:familyId` but the existing document is not carried over. The OrderFiles page starts blank with no files.

## Solution
Pass the source order ID as a query parameter. On the OrderFiles page, after lazy-creating the new order, copy the document(s) from the source order into the new order item.

## Changes

### `src/pages/dashboard/CustomerDashboard.tsx`
- Update the product selection `onClick` to include the source order ID as a query param:
  ```
  /t/${slug}/orders/new/${f.id}?from=${order.id}
  ```

### `src/pages/dashboard/OrderFiles.tsx`
1. Read the `from` query parameter using `useSearchParams`
2. After `ensureOrder()` creates the new order and order item, if `from` is present:
   - Query `documents` from the source order's order item
   - For each document, insert a copy into the new order item (same `storage_key`, `file_name`, `page_count`, `thumbnail_urls`, `page_width_mm`, `page_height_mm`, `preflight_data`)
   - Refetch documents so they appear in the file list
3. Clear the `from` param from the URL after copying (to prevent re-copying on refresh)

### Document copy logic
The documents reference files in Supabase Storage by `storage_key`. We don't need to duplicate the actual file — just create new `documents` rows pointing to the same storage objects. This is fast and avoids storage duplication.

## Flow
1. User clicks "Create" on a recent file → picks product → navigates to `/t/:slug/orders/new/:familyId?from=<sourceOrderId>`
2. OrderFiles detects `from` param, auto-triggers `ensureOrder()` immediately (no need to wait for file drop)
3. Copies documents from source order into new order item
4. File list populates with the copied documents, ready for section assignment

