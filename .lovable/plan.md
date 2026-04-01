

# Plan: Fix Add-to-Cart Flow and Draft Reopening

## Problems Identified

1. **No reference prompt before checkout** — The reference input is a small field buried in the options panel header. Users miss it entirely. There's no prompt or validation before "Add to Cart".

2. **Add to Cart may silently fail** — `handleAddToCart` calls `calculateItemPrice()` which can throw if no pricing rules exist. The error may not surface clearly. Also, there's no loading state on the button.

3. **Reopening a draft shows blank files** — When a draft order is clicked from the orders list, it navigates to `/t/${slug}/orders/${id}/files`. The `useOrderData` hook fetches documents by `order_item_id`. This should work IF the order item and documents exist. The likely issue: when `handleAddToCart` fails partway (spec saved but confirm didn't complete), the order stays "draft" but the UI doesn't indicate the error. When the user reopens via the orders list, documents should load. I need to verify the query chain isn't broken.

4. **No actual cart** — "Add to Cart" just sets status to "quoted" and navigates to the orders list. There's no cart page, no checkout step. This is confusing UX.

## Changes

### 1. `src/pages/dashboard/OrderBuild.tsx` — Prompt for reference before Add to Cart

- Modify `handleAddToCart` to show a dialog if `reference` is empty, asking for a name/reference before proceeding
- Add a loading/disabled state to the Add to Cart button while the mutation runs
- Add proper try/catch with clear error messages when `calculateItemPrice` fails (e.g. "No pricing rules configured")
- Pass `isSubmitting` state down to `PriceSummary`

### 2. `src/components/order/PriceSummary.tsx` — Loading state

- Accept `isSubmitting` prop to show spinner on the Add to Cart button while processing

### 3. `src/pages/dashboard/OrderBuild.tsx` — Add to Cart confirmation dialog

- Create a small confirmation dialog that:
  - Shows the reference field (pre-filled if already entered)
  - Shows the total price
  - Has "Confirm" and "Cancel" buttons
- Only after confirmation does the actual `confirmItem` mutation run

### 4. `src/pages/dashboard/OrderBuild.tsx` — Fix silent failures

- Wrap `calculateItemPrice` in try/catch with user-friendly error
- Add console logging to diagnose if the confirm mutation fails
- Ensure navigation only happens after successful confirmation

### 5. `src/pages/dashboard/CustomerOrders.tsx` — Draft navigation fix

- When a "quoted" order is clicked, navigate to `/build` (already correct)
- When a "draft" order is clicked, navigate to `/files` (already correct)
- Add a check: if a draft has documents, show a "Continue" label instead of just the arrow

## Files modified
- `src/pages/dashboard/OrderBuild.tsx` — Add confirmation dialog, fix error handling, loading state
- `src/components/order/PriceSummary.tsx` — Add `isSubmitting` prop for button state

## Implementation order
1. Add confirmation dialog + loading state to OrderBuild
2. Update PriceSummary for submitting state
3. Improve error handling in handleAddToCart

