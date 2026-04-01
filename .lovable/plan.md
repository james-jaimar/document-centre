

# Plan: Fix Add-to-Cart Silent Failures and Draft Reopening

## Root Causes

1. **Add to Cart silently does nothing**: `handleAddToCartClick` has a guard `if (!orderItem || !order) return;` with NO feedback. If data is still loading or the query failed, the button click is swallowed silently.

2. **No validation before Add to Cart**: Users can click "Add to Cart" with 0 pages (no sections assigned) or 0 documents. The price calculates but might be nonsensically low (just the setup fee). There should be validation requiring at least one document section.

3. **Draft reopening shows blank files**: When clicking a draft from the orders list, it navigates to `/files`. The `useOrderData` hook loads documents via `order_item_id`. If the order item has no documents (empty draft), the page correctly shows nothing — but there's no guidance telling the user to upload files. The "blank preview" on the `/build` page happens because there are no sections to render.

## Changes

### 1. `src/pages/dashboard/OrderBuild.tsx` — Add validation and feedback

- Add a toast/alert when `handleAddToCartClick` is called but `orderItem` or `order` is null: `toast.error("Order data is still loading. Please wait.")`
- Add validation: if `sections.length === 0`, show `toast.error("Please upload and assign at least one file before adding to cart")` and return
- Add validation: if `spec.page_count === 0`, show a warning toast
- Add `console.log` breadcrumbs in `handleAddToCartClick` and `handleConfirmAddToCart` to aid future debugging

### 2. `src/pages/dashboard/OrderBuild.tsx` — Disable button when not ready

- Pass `disabled` prop to `PriceSummary` when `sections.length === 0` or `!orderItem` or `!order`
- This prevents clicking "Add to Cart" before the document is configured

### 3. `src/pages/dashboard/OrderBuild.tsx` — Fix draft reopening blank preview

- When `documents.length === 0` and `sections.length === 0` on the build page, show a message: "No files uploaded yet" with a button linking back to the files step
- This prevents users from seeing a blank, confusing page

### 4. `src/pages/dashboard/CustomerOrders.tsx` — Smarter draft navigation

- For drafts that have documents but no sections, navigate to `/files` (resume uploading)
- For drafts that have sections, navigate to `/build` (resume configuring)
- Show "Continue" text on rows with existing documents

## Files modified
- `src/pages/dashboard/OrderBuild.tsx` — validation, disabled state, empty state messaging
- `src/pages/dashboard/CustomerOrders.tsx` — smarter draft navigation with document check

## Implementation order
1. Add validation + feedback to OrderBuild's add-to-cart flow
2. Add empty state UI on OrderBuild when no files exist
3. Update CustomerOrders draft navigation logic

