## Problem

The Canvas 3D preview crashes the page. `Canvas3DPreview.tsx` uses drei's `<Environment preset="apartment" />`, which fetches an HDR from `raw.githack.com`. Our CSP `connect-src` does not allow that host, so the fetch is blocked, drei throws "Could not load lebombo_1k.hdr", the WebGL context is lost and the modal goes blank.

A separate console warning (`Missing Description or aria-describedby for {DialogContent}`) comes from the Canvas editor modal not declaring a `DialogDescription`. Harmless but noisy — worth fixing in the same pass.

## Fix

1. `src/components/canvas/Canvas3DPreview.tsx`
   - Remove `<Environment preset="apartment" />` and the `Environment` import.
   - Compensate for the lost image-based lighting with cheap, local lights so the canvas still looks 3D:
     - Bump `ambientLight` intensity slightly.
     - Add a `hemisphereLight` (warm top / cool bottom) for soft fill.
     - Keep the existing key + rim directional lights.
   - No network calls, no CSP change needed.

2. `src/pages/dashboard/CanvasPrintsBuilder.tsx` (or wherever the Canvas editor `DialogContent` lives — will confirm on read)
   - Add a visually-hidden `DialogDescription` (or `aria-describedby`) to silence the Radix a11y warning.

## Not doing

- Not widening CSP to allow `raw.githack.com`. Third-party HDR hosting is fragile and unnecessary for this preview.
- No pricing, wrap-mode, or geometry changes.

## Verification

- Reopen the Canvas editor: 3D preview renders with lights only, no console errors, no context loss.
- Radix warning gone.
