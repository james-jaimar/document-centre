

# Stop auto-creating draft orders & add save/reference prompt

## Problem
Every time the user navigates to "Create", a new draft order is created in the database. Going in and out repeatedly creates dozens of empty drafts. There's also no way to name/reference an order.

## Changes

### 1. Add a "reference" field to the OrderBuild page
**File: `src/pages/dashboard/OrderBuild.tsx`**
- Add a text input at the top of the options panel (or header area) for "Order Reference" (e.g. "Marketing Brochure Q2")
- Store this in local state, default to empty
- On "Add to Cart", pass the reference to `confirmItem` so it gets saved to `orders.reference` or `order_items.title`

### 2. Add unsaved-changes guard when leaving OrderBuild
**File: `src/pages/dashboard/OrderBuild.tsx`**
- Track a `dirty` flag — set to `true` whenever `spec` changes from its initial DB value
- Intercept the "Back to Files" button click and browser back navigation
- Show a confirmation dialog: "You have unsaved changes. Save before leaving?" with three options:
  - **Save & Leave** — saves spec + reference, then navigates
  - **Discard** — navigates without saving
  - **Cancel** — stays on page
- Use `react-router`'s `useBlocker` or a custom `beforeunload` handler

### 3. Create a SaveConfirmDialog component
**File: `src/components/order/SaveConfirmDialog.tsx`** (new)
- AlertDialog with the reference input field and Save/Discard/Cancel buttons
- On save, calls `updateSpec` with current spec and updates the order item title/reference

### 4. Stop creating new orders when one already exists in draft
**File: `src/pages/dashboard/NewOrder.tsx`**
- Before creating a new order, check if there's already a draft order for this product family with no documents/sections
- If so, navigate to the existing draft instead of creating a new one
- This prevents the proliferation of empty drafts from repeated clicks

### 5. Update confirmItem to accept a reference/title from user input
**File: `src/hooks/useOrderBuilder.ts`**
- The `useConfirmOrderItem` mutation already accepts a `title` parameter — use the user-provided reference if available, falling back to product family name

## Summary
- Reference field on the build page for naming orders
- Unsaved changes dialog when navigating away
- Reuse existing empty drafts instead of creating new ones on every "Create" click

