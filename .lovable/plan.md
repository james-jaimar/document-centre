

## Three issues, one approval

### 1. "Order not found" after placing order

**Cause**: After `placeOrder.mutateAsync(...)` returns the new `order_id`, `Checkout.tsx` navigates to `/orders/${cart.id}/confirmation` — but `cart.id` is the **cart order that was just deleted** by the place-order mutation. The confirmation page queries that deleted ID with `.single()` → 406 Not Acceptable → "Order not found".

**Fix**: 
- `usePlaceOrder.mutateAsync` already returns the real `order_id` (line 512). Capture it in `Checkout.handlePlaceOrder` and navigate to `/orders/${newOrderId}/confirmation`.
- In `OrderConfirmation.tsx`, use `.maybeSingle()` instead of `.single()` and show a graceful "still loading…" state for ~1s instead of "Order not found" if the row hasn't propagated.

### 2. Client doesn't see the new order until they click Orders again

**Cause**: `usePlaceOrder.onSuccess` invalidates `["cart"]`, `["all_orders"]`, `["orders"]`. But the customer "My Orders" page (`CustomerOrders.tsx`) uses query key `["all_orders", userId, tenantId]`. Invalidation does match (prefix match), so this should work — but the user lands on Confirmation (broken, see #1) instead of Orders. Once #1 is fixed and the user clicks "My Orders", the cache is fresh.

**Also**: confirm `CustomerOrderDetail` route exists for the new `order_id` so the "View Order Details" button works.

### 3. "Place Order" feels slow

**Cause**: `usePlaceOrder.mutationFn` performs five sequential round-trips before invoking the edge function:

1. `select` cart with items
2. `select` profile
3. `select` app by id
4. `select` product_options + document_sections + documents (already parallel — good)
5. `functions.invoke("order-engine")`

Then the edge function does ~10 sequential admin writes (order, jobs, addresses, pricing snapshot, timeline, membership check), and finally the client does 4 more deletes (sections, docs, items, order) before resolving.

**Fix**:
- **Client**: Run cart-load + profile-load + app-load in parallel (`Promise.all`). Saves ~2 round-trips.
- **Client**: Move the post-success cleanup deletes (lines 500–510) into a fire-and-forget background promise — don't block the user's navigation. The deletion is non-critical: the cart row is no longer needed by the user. Resolve the mutation immediately after `data.order_id` is returned.
- **Client**: Remove the redundant cart cleanup entirely if the order-engine should own it (defer; keep deletes but background them for now).
- **Edge function**: Parallelize the independent inserts after the order row exists — `order_jobs`, `order_addresses`, `order_pricing_snapshots`, `timeline_events`, and `tenant_memberships` upsert can all run in `Promise.all` once `newOrder.id` is known. Currently they're awaited sequentially.
- **Edge function**: The `for (job of jobs)` proof-insert + job status update loop runs N×2 sequential writes. Convert to a single bulk insert + bulk update (or skip when no jobs need proofs — currently no checkout flow sets `j.proof`).

Net effect: place-order should drop from ~3–5s to <1s.

### 4. Console noise (separate, lower priority)

- `406 GET /orders?id=eq...&order_n_ame...` — that's the confirmation `.single()` failure from #1. Fixed by #1.
- `[PreviewType] falling back to slug: booklets → saddle_stitched ... options count: 6` — repeated noisy log inside preview-type detector. Add a "logged once per session" guard. Mention in plan but optional.

## Files to change

- `src/pages/dashboard/Checkout.tsx` — capture returned `order_id`, navigate to `/orders/${order_id}/confirmation`.
- `src/hooks/useCart.ts` (`usePlaceOrder`) — parallelize cart/profile/app fetches; background the cleanup deletes; return `order_id` (already does).
- `src/pages/dashboard/OrderConfirmation.tsx` — use `.maybeSingle()`, show friendly "preparing your order…" state with auto-retry (refetch every 500ms for up to 3s) when row not yet visible.
- `supabase/functions/order-engine/index.ts` — parallelize independent inserts after the order row is created; remove sequential proof loop overhead when no proofs requested.
- `src/components/preview/previewTypes.ts` — add once-per-session log guard for the "falling back" warning (optional, only if quick).

## Verification

1. Cart with one item → click Place Order → button spinner shows briefly (<1s) → lands on Confirmation page showing the **real** `INV-XXXXX` number, totals, and items.
2. "View Order Details" → opens the order detail page successfully.
3. Sidebar Orders → new order appears in Placed Orders without manual refresh.
4. Network tab: no 406 errors after place order.
5. Console: no more `_n_ame` typo'd 406 requests.

## Out of scope

- VPS / Document Centre API diagnostics (already deferred).
- Refactoring order-engine into a stored procedure (bigger project; current parallelization is enough for now).

