

## Cart not updating immediately after order placement

### Root cause

In `usePlaceOrder` (`src/hooks/useCart.ts`), the cart cleanup runs as a fire-and-forget background task:

```ts
void (async () => {
  await supabase.from("document_sections").delete()...
  await supabase.from("documents").delete()...
  await supabase.from("order_items").delete()...
  await supabase.from("orders").delete()...
})();

return data.order_id;
```

`onSuccess` then invalidates the `["cart"]` query, but the refetch races against the not-yet-completed deletes — Supabase often returns the still-present cart with its items, so the badge and Cart page keep showing the old contents until the next manual refresh.

### Fix

**`src/hooks/useCart.ts` (`usePlaceOrder`)**
- `await` the cart cleanup before returning, so the deletes are committed before React Query refetches.
- Replace the narrow invalidation in `onSuccess` with `invalidateUserOrderCaches(qc)` so the cart badge, orders list, recent docs, and tracking views all refresh together.
- As a belt-and-braces measure, optimistically clear the cart query data (`qc.setQueryData(["cart", user.id, tenantId], null)`) right after a successful response so the UI updates instantly even before the refetch resolves.

### Files changed

| File | Change |
|------|--------|
| `src/hooks/useCart.ts` | Await cart cleanup; use `invalidateUserOrderCaches`; optimistically null the cart cache |

### Result

The cart badge drops to 0 and the Cart page empties the moment the order is placed, with no stale data.

