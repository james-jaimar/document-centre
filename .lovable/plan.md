

## Add "Edit" functionality for cart items

### Problem
Once an item is added to cart, the user has no way to go back and edit its configuration, quantity, or files. This is a critical usability gap.

### Approach
Create an "Edit" flow that moves a cart item back to a temporary draft order so the existing OrderBuild page can handle it. When the user finishes editing and clicks "Add to Cart" again, it moves back to the cart — exactly the same flow as the first time.

### Changes

**1. `src/hooks/useCart.ts`** — Add `useEditCartItem` mutation
- Creates a new temporary draft order for the user
- Moves the selected `order_item` (and its linked `documents` and `document_sections`) back to the new draft order by updating `order_id`
- Recalculates the cart total after removing the item
- Sets `build_status` back to `building` so OrderBuild treats it as editable
- Returns the new draft order ID for navigation

**2. `src/pages/dashboard/Cart.tsx`** — Add Edit button per row
- Add a pencil/edit icon button next to each item (alongside the existing delete button)
- On click, calls `useEditCartItem`, then navigates to `/t/:slug/orders/:newDraftId/build`
- Shows a loading spinner while the mutation runs

**3. `src/pages/dashboard/OrderBuild.tsx`** — Minor tweak
- The page already works correctly for this flow since it loads order → first order_item → documents/sections. No changes needed unless the `build_status = "ready"` blocks editing (it doesn't based on current code).

### User flow
1. User sees cart with an Edit (pencil) icon on each row
2. Clicks Edit → item is moved to a new draft order → navigates to the build/configure page
3. User makes changes, clicks "Add to Cart" again → item moves back to cart with updated config
4. The old empty draft order is cleaned up automatically (existing logic in `useAddItemToCart`)

