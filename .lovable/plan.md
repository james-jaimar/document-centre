

## Plan: Add Product Images to Dashboard Product Picker

### Problem
The product images were added to `NewOrder.tsx` but the dashboard (`CustomerDashboard.tsx`) still shows the old icon-only product tiles. The dashboard product picker at lines 200-222 renders `<Icon>` components inside circular thumbnails with no image support.

### Changes

**File: `src/pages/dashboard/CustomerDashboard.tsx`**

1. Import the same product images from `src/assets/products/`
2. Add the same `SLUG_IMAGE_MAP` lookup used in `NewOrder.tsx`
3. Update the product tile rendering (lines 210-216) to show the product image when available, falling back to the icon

The tile will display a rounded image thumbnail instead of the icon, maintaining the existing circular `product-thumb` container style but switching to an `<img>` element when an image is mapped.

### No other files affected
- Images already exist in `src/assets/products/`
- `NewOrder.tsx` already works correctly with images
- Only the dashboard picker needs the update

