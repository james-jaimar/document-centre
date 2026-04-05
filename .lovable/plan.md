

# Plan: Product Picker for "Recently Uploaded Files" Create Button

## Problem
Clicking "Create" next to a recently uploaded file navigates directly to the old order's file page. It should instead prompt the user to choose which product they want to create using that file.

## Solution
Add a small product-picker popover/dialog that appears when clicking "Create". It shows the same product family grid from the top of the dashboard. On selection, navigate to the lazy-creation route `/t/:slug/orders/new/:familyId` (which only creates the DB record on first upload — but here the file already exists, so we may need to handle re-association separately later).

## Changes

### `src/pages/dashboard/CustomerDashboard.tsx`
1. Add a `Popover` (from shadcn) anchored to the "Create" button for each row
2. Inside the popover, render the product families as a compact grid (icon + name)
3. On product selection, navigate to `/t/:slug/orders/new/:familyId` — the file re-use/association can be wired in a follow-up
4. Remove the current direct `navigate` to the old order's files page

### UI behavior
- Click "Create" → popover opens with product options (same families from the top picker)
- Click a product → popover closes, navigates to the new order flow for that product
- Click outside → popover dismisses

No new files needed. Single file edit.

