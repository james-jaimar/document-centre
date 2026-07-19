## Plan

1. Replace the pull-up banner image asset with a normal local product image import, matching the existing product tiles such as Photo Prints.
2. Add `src/assets/products/pull-up-banners.jpg` from the uploaded JPG and remove the `.asset.json` usage from the product tile code.
3. Update both product image maps:
   - `src/pages/dashboard/NewOrder.tsx`
   - `src/pages/dashboard/CustomerDashboard.tsx`
4. Verify the rendered `<img>` source is emitted through Vite’s normal `/assets/...jpg` pipeline, not `/__l5e/assets-v1/...`.

## Confirmed current state

- Existing working product images are imported directly from `src/assets/products/*.jpg`, which Vite serves as `/assets/name-hash.jpg`.
- Pull-up banners currently imports `src/assets/products/pull-up-banners.jpg.asset.json` and uses `imgPullUpBanners.url`, producing `/__l5e/assets-v1/...`.
- The local dev server is returning `text/html` for that `/__l5e/assets-v1/...jpg` path, so the browser cannot display it as an image in the preview.