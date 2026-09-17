# Restore responsive admin order details

The overflow is confirmed in the shared order-detail layout. The 16 September change correctly exposed uploaded artwork stored in the older nested job format, but that also rendered an 1100-pixel proof canvas. The three-column grid still uses an automatically sized centre track, so the canvas becomes the track's minimum width and pushes the timeline beyond the viewport.

## Changes

1. **Constrain the admin shell**
   - Allow the content side of the fixed sidebar layout and its main area to shrink within the browser width.
   - Keep scrolling inside the existing admin content area; do not alter the storefront or editor layouts.

2. **Make both order-detail grids genuinely responsive**
   - Change the centre track from an auto-minimum `1fr` to a shrinkable `minmax(0, 1fr)` track.
   - Add shrink boundaries to the left, centre and timeline columns so artwork, filenames and messages cannot enlarge the page.
   - Apply the same correction to tenant-admin and branch-admin order details because both use the same structure and proof panel.

3. **Contain the artwork proof**
   - Keep the proof visible and downloadable, but cap its canvas and wrapper to the available column width.
   - Preserve the full-size proof modal for close inspection.

## Verification

- Reopen the affected Impress Print order at the supplied desktop viewport and confirm there is no horizontal page overflow.
- Confirm Order Details, Job Details and Timeline all remain visible within the viewport.
- Check narrower desktop/tablet widths: columns stack before becoming cramped, filenames wrap or truncate safely, and the proof scales down.
- Confirm the full-proof view and customer-file download controls still work.
- Run the focused checks and TypeScript validation.

## Files

- `src/components/AppLayout.tsx`
- `src/pages/admin/AdminOrderDetail.tsx`
- `src/pages/branch/BranchOrderDetail.tsx`
- `src/components/orders/detail/JobDetailPanel.tsx`
- `src/components/orders/detail/ArtworkAdminProof.tsx`
