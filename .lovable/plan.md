

# Restructure Dashboard Layout: Full-Width Upload + 2x2 Grid

## What changes

Currently the layout is: product picker on top, then a 2-column split with the upload zone + 2 tables on the left, and uploaded files + order tracking on the right. The upload zone only spans the left column.

Mimeo's approach is cleaner: the drag-and-drop zone spans the full width beneath the product picker, then all four data tables sit in a 2x2 grid below.

## New layout structure

```text
┌─────────────────────────────────────────────┐
│         Product Picker (horizontal)         │
├─────────────────────────────────────────────┤
│  "Get started by uploading PDFs" heading    │
│  ┌─────────────────────────────────────┐    │
│  │   Full-width drag & drop zone       │    │
│  └─────────────────────────────────────┘    │
├──────────────────────┬──────────────────────┤
│  Recently Uploaded   │  Recently Modified   │
├──────────────────────┼──────────────────────┤
│  Frequently Ordered  │  Order Tracking      │
└──────────────────────┴──────────────────────┘
```

## File to edit

### `src/pages/dashboard/CustomerDashboard.tsx`

Restructure the JSX return:

1. Keep the product picker card as-is at the top
2. Move the upload heading + dropzone to be full-width (no longer inside the left column of a grid)
3. Below that, create a single `grid grid-cols-1 xl:grid-cols-2 gap-6` containing all four table cards in order:
   - Recently Uploaded Files (top-left)
   - Recently Modified (top-right)
   - Frequently Ordered (bottom-left)
   - Order Tracking (bottom-right)

No new components, no data changes — purely a layout restructure of existing blocks.

