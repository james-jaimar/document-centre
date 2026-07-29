## Bug
Canvas orders started via **Create → Canvas Prints** land on `/t/:slug/orders/new/:familyId`, which routes to the generic `OrderFiles` uploader. The existing redirect to `CanvasPrintsBuilder` is gated on `effectiveOrderId`, but in new-order mode no order exists yet (it's lazily created on first upload). So the customer sees the wrong UI (Front Cover / Body / Back Cover, duplex option, no cropper, no QR upload).

## Fix
In `src/pages/dashboard/OrderFiles.tsx`, extend the specialised-builder redirect `useEffect` to also fire in new-order mode, using `routeFamilyId` + `productFamily.kind` without waiting for an order id:

- If `isNewMode && productFamily.kind === "canvas_wrap"` → `navigate(tenantPath("orders/new/canvas-prints"), { replace: true })`
- If `isNewMode && productFamily.kind === "photo_print"` → `navigate(tenantPath("orders/new/photo-prints"), { replace: true })`
- Existing-order branch (`effectiveOrderId` present) stays as-is.

Both target routes are already registered in `src/App.tsx`. No other files change.

## Verification
- From Create, pick Canvas Prints → should land directly in `CanvasPrintsBuilder` (cropper, per-image tiles, QR upload, no duplex option, product image not shown in place of upload).
- Existing canvas orders opened via Orders/Cart still redirect correctly (unchanged branch).
- Non-canvas/non-photo families continue to render `OrderFiles` normally.
