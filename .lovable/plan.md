
## Problem

The "Upload from Phone" button only appears when `orderItemId` is defined, but the order item is lazily created on first file upload. So on a fresh Photo Prints page (no files yet), the button is hidden.

## Solution

Two changes:

### 1. PhotoUploader: Always show the button, accept an `onPhoneUpload` callback

Instead of conditionally rendering the phone button based on `orderItemId`, add an `onPhoneUpload` prop. When provided, the button always shows. When clicked, it calls `onPhoneUpload` which the parent uses to ensure the order exists, then opens the QR modal.

### 2. PhotoPrintsBuilder: Wire up eager order creation for phone upload

When the user clicks "Upload from Phone":
1. Call `ensureOrder()` to create the order/order-item if needed.
2. Set the resulting order item ID into state.
3. Open the QR modal with the now-valid `orderItemId`.

### Files modified

- `src/components/photo/PhotoUploader.tsx` -- Add `onPhoneUpload` prop; always show button when prop is provided; call it on click instead of directly opening QR modal.
- `src/pages/dashboard/PhotoPrintsBuilder.tsx` -- Pass `onPhoneUpload` handler that calls `ensureOrder()` then opens the QR modal via state.

This keeps the lazy-order pattern intact (order is only created when actually needed) while making the phone upload button visible from the start.
