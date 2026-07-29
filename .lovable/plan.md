## Problem

All 5 issues in the screenshots stem from the same root cause: the order was opened through the generic `/orders/:id/files` → `/orders/:id/build` route, not through the dedicated `CanvasPrintsBuilder` at `/orders/:id/canvas-prints`.

The Canvas builder page already exists and already implements everything the user is asking for — customer image tiles (not the product hero), a "canvas"-shaped upload target (no Front/Body/Back sectioning), simplex-only spec (`is_duplex: false` hard-coded), the `CanvasEditorModal` cropper/wrap editor, `CanvasTile` previews, and `QRUploadModal` for phone upload. The generic flow shown in the screenshots has none of that because it is the bound-document/flyer flow.

Verified in code:
- `src/App.tsx` lines 169/174 register `/orders/new/canvas-prints` and `/orders/:id/canvas-prints` → `CanvasPrintsBuilder`.
- `src/pages/dashboard/NewOrder.tsx` line 58 redirects the "new order" tile for `canvas-prints` correctly.
- `src/pages/dashboard/OrderFiles.tsx` and `OrderBuild.tsx` have no `canvas_wrap` branch, so any existing canvas order opened from the Orders list / cart / email link lands in the generic sectioned uploader.

## Fix

Add a family-kind redirect at the top of both `OrderFiles.tsx` and `OrderBuild.tsx`: when the loaded `order_items.spec` / `product_families.kind` is `canvas_wrap`, `navigate(tenantPath(\`orders/${id}/canvas-prints\`), { replace: true })` before rendering anything else. Same guard should also cover `photo_print` for symmetry (currently only protected by initial navigation, so a deep link exhibits the same class of bug).

### Details

1. In `OrderFiles.tsx`, after `order` / `orderItem` load, read `orderItem.product_family_id` → look up `product_families.kind`; if `canvas_wrap` redirect to `/orders/:id/canvas-prints`, if `photo_print` redirect to `/orders/:id/photo-prints`. Render a small "Loading…" while the family fetch resolves so we don't flash the wrong UI.
2. Same guard added at the top of `OrderBuild.tsx`.
3. Audit `CustomerOrderDetail`, cart, and email/nudge links that emit `/orders/:id/files` or `/build` — if the target order is a canvas or photo order, emit the specialised path directly (belt-and-braces; the redirect above already covers late arrivals).

No changes are needed to `CanvasPrintsBuilder` itself — it already handles the existing-order case via `orderIdParam`, already writes `is_duplex: false`, already renders `CanvasTile` for the customer's own uploaded image, and already exposes the QR uploader through `handlePhoneUpload`.

### Out of scope

- No changes to the canvas pricing/options/preview logic.
- No schema changes.
