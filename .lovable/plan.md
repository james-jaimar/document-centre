## Problem
The pull-up banners product tile shows a broken image (alt text only). The current asset (`src/assets/products/pull-up-banners.png.asset.json`, 1.6MB PNG) isn't loading in the preview.

## Plan
1. Delete the existing asset pointer via `lovable-assets delete` to remove the orphaned CDN object.
2. Upload the new smaller image from `/mnt/user-uploads/PULL_UP_BANNERS.jpg` using `lovable-assets create`, writing the pointer to `src/assets/products/pull-up-banners.jpg.asset.json`.
3. Update the import in `src/pages/dashboard/NewOrder.tsx` (and `CustomerDashboard.tsx` if it references the same file) to point at the new `.jpg.asset.json` pointer.
4. Verify the tile renders by checking the preview.

No other logic changes.