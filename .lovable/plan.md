

# Fix: Order title, status, and price not saved on "Add to Cart"

## Problems

1. **No title**: `order_items.title` is never set. The orders list shows "Untitled".
2. **Status stays "draft"**: `handleAddToCart` saves the spec but never updates `order_status` or `build_status`.
3. **Price not saved**: The calculated price is never written to `order_items.unit_price` or `orders.total_price`.

## Changes

### File: `src/pages/dashboard/OrderBuild.tsx`

Update `handleAddToCart` to:

1. **Calculate the price** using the existing `calculateItemPrice` function (already available via `PriceSummary` — just call it directly).
2. **Update `order_items`**: Set `title` to the product family name (e.g. "Bound Document"), `unit_price` to the calculated per-unit price, `quantity` to `spec.quantity`, and `build_status` to `"confirmed"`.
3. **Update `orders`**: Set `total_price` to the full total and `order_status` to `"quoted"` (or `"confirmed"` — moving it out of draft).
4. **Navigate** to the orders list.

### File: `src/hooks/useOrderBuilder.ts`

Add a new mutation `useConfirmOrderItem` that:
- Updates `order_items` with `title`, `unit_price`, `quantity`, `build_status = 'confirmed'`
- Updates `orders` with `total_price`, `order_status = 'quoted'`

### File: `src/pages/dashboard/CustomerOrders.tsx`

The product column currently shows `item?.title || "Untitled"`. Once the title is set, this will display correctly. No changes needed if the title is written properly.

## Summary of flow

```text
User clicks "Add to Cart"
  → save spec to order_items
  → calculate price
  → update order_items: title, unit_price, quantity, build_status
  → update orders: total_price, order_status
  → navigate to /dashboard/orders
```

