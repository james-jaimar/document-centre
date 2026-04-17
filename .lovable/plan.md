

# Plan: Wire up order placement → confirmation → My Orders → Tenant admin

## What's actually broken

Walking through the placed order in DB (`INV-00011`, R701.50, 1 job, `admin_status=in_production`) vs what the screenshots show, there are **5 distinct bugs**:

### Bug 1 — Customer "My Orders" shows stale draft, not the placed order
`CustomerOrders.tsx` queries the legacy column `order_status` (values: `cart`/`draft`/`confirmed`...). But `usePlaceOrder` calls the order-engine, which writes the **new engine columns** (`admin_status`, `customer_status`, `payment_status`, `order_number`) and leaves `order_status='draft'` (the column default).

So a fully-paid, in-production order still appears as "Draft" with R0.00 because:
- Status read from `order_status` (= `'draft'`) instead of `customer_status`
- Total read from `total_price` (= 0) instead of `total_amount` (= 701.50)
- Order number falls back to `id.slice(0,8)` because the list code doesn't read `order_number`

The `ceb96102` row is a legacy abandoned draft cart (no items, no `app_id`) that should be hidden.

### Bug 2 — Clicking the order goes to the build/files page, not the order detail
In `CustomerOrders.tsx`:
```ts
const dest = isDraft
  ? `/t/${slug}/orders/${order.id}/files`   // ← wrong: it's actually placed
  : `/t/${slug}/orders/${order.id}`;
```
Because `order_status` stays `'draft'`, every placed order is misrouted back to the file-upload step (the "preview window" the user described).

### Bug 3 — Tenant admin "Order Manager" shows 0 orders
`useAdminOrders` already filters with `.not("app_id","is",null)` (good) and passes `tenant_id` from the admin's selected tenant. The placed order is on `tenant_id = b0000000...001` (Printworks), NOT the PostNet tenant the user is currently viewing. So the admin grid is correct — the user just placed the order on the **Printworks** storefront, not PostNet. We need to verify and add a clear empty-state hint, but no filter bug.

However, `AdminOrders` may also be filtering by branch incorrectly. Need to confirm the branch filter on `useAdminOrders` doesn't exclude orders without a `branch_id`.

### Bug 4 — `usePlaceOrder` deletes the cart `order_items` rows the engine still references
At the end of `usePlaceOrder`, after the engine creates the new order + jobs, the client deletes the old cart `order_items`, `documents`, and `document_sections`. Those rows are no longer referenced by the new `order_jobs` (configuration is snapshot into JSON), so this is OK — but it also means the **document files in S3 are orphaned** (we don't migrate them onto `order_documents`). Out of scope for this fix, flagging only.

### Bug 5 — `OrderConfirmation` reads `order_items` (deleted by `usePlaceOrder`) and `total` from per-item prices
After placement, `order_items` for the placed order are gone (engine creates `order_jobs` instead). The confirmation page shows blank totals. It must read from `order_jobs` and use `total_amount`.

---

## Fix

### A. `src/pages/dashboard/CustomerOrders.tsx`
- Filter out: `order_status='cart'` AND any row where both `app_id IS NULL` and `order_number IS NULL` (legacy abandoned drafts).
- Treat a row as "placed" when `app_id IS NOT NULL` and `order_number IS NOT NULL` (or when `submitted_at IS NOT NULL`).
- Display label/color from `customer_status` (with fallback to legacy `order_status` for any pre-engine rows).
- Display total from `total_amount` falling back to `total_price`.
- Display `order_number` falling back to short id.
- Routing: placed orders → `/t/${slug}/orders/${id}`; only true drafts (no `order_number`) → `/t/${slug}/orders/${id}/files`.
- Tab buckets keyed off `customer_status`:
  - Drafts: no `order_number`
  - In Progress: `awaiting_payment`, `proof_pending`, `in_production`, `on_hold`, `ready`, `dispatched`
  - Completed: `completed`, `cancelled`

### B. `src/pages/dashboard/OrderConfirmation.tsx`
- Query `orders` selecting engine columns + `order_jobs(id, product_name, quantity, gross_price)`.
- Show total from `order.total_amount`, items count from `order_jobs.length`.
- Add "View Order Details" button → `/t/${slug}/orders/${id}` (the new ecommerce order page).

### C. `src/hooks/useCart.ts` — `usePlaceOrder`
- After successful engine call, also clear `order_status='cart'` cleanup is fine, but ensure we set `submitted_at` is already done by engine.
- No structural change — the engine already does the right thing.

### D. `src/pages/admin/AdminOrders.tsx` (verify only — read first)
- Confirm the tenant/branch filter behaves correctly when admin is impersonating a tenant context.
- If `tenant_id` filter excludes orders where `branch_id` doesn't match the admin's branch context, broaden it: when viewing a tenant, include all orders for that tenant regardless of `branch_id`.
- Add a friendly "No orders for {tenant name}" empty state mentioning the user may have placed it on a different storefront.

### E. (No backend changes — all fixes are client-side reads/routing.)

## What stays the same
- Order-engine logic (it already correctly creates the order + jobs + status_history + numbering).
- RLS policies (already permit customer to read their own orders via `user_can_read_order`, and staff via `user_is_staff_for`).
- Cart and checkout flow itself.

## Verification after fix
1. The existing INV-00011 (R701.50) should immediately appear in My Orders on the **Printworks** storefront with status "In Production", total R701.50, clickable to a real order detail page.
2. The stale `ceb96102` draft should no longer appear (no `app_id`).
3. Switch admin to **Printworks** tenant → Order Manager should show INV-00011.
4. Place a new test order on PostNet → confirmation shows total + jobs → My Orders shows it placed → Admin (PostNet) shows it in Order Manager.

