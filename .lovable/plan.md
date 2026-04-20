
## Bug

"Recently Modified" lists empty draft `order_items` (no documents, no sections) created when a customer clicks a product tile and bails before uploading. Clicking **Continue** correctly navigates to the files page — but there's literally nothing to load because no files were ever uploaded against that draft.

Verified in DB: items `65dafe75…`, `1ad18c20…`, `ad0ea66c…` all have `build_status='draft'`, `documents=0`, `sections=0`.

This also violates the project's lazy-order-creation rule (`mem://orders/lazy-order-creation`). `useCreateOrder` in `src/hooks/useOrderBuilder.ts` is called eagerly from the product tile (`CustomerDashboard.handlePickProduct`) and creates an empty `orders` + `order_items` row before the user uploads anything.

## Fix

### 1. Hide empty drafts from "Recently Modified"
`useRecentOrderItems` in `CustomerDashboard.tsx` should only return items that have at least one document or one section. Filter via a join/exists check so the dashboard never advertises hollow drafts.

### 2. Stop creating orphans (root cause)
Make product-tile selection truly lazy:
- `handlePickProduct` no longer calls `createOrder.mutateAsync`.
- Instead it navigates to the existing `new-order` route with the family preselected: `/t/:slug/orders/new/:familyId` (already supported by `OrderFiles.tsx` via `routeFamilyId` + `isNewMode`).
- The order is then created by `OrderFiles` only on first file upload (the `ensureOrder` path that's already there).

### 3. Clean up existing orphans
One-off migration: delete `order_items` (and their parent `orders` if the order has no other items) where `order_status='draft'`, `build_status='draft'`, no documents and no sections, and `updated_at` older than e.g. 1 hour. Also runnable now to clear the current 5 visible orphans for this user.

### 4. Verify Continue still works for real drafts
For a draft item with at least one uploaded document, Continue → `/orders/:id/files` already loads docs/sections through `useOrderData(effectiveOrderId)`. No code change needed; the bug was purely empty drafts being surfaced.

## Files

- `src/pages/dashboard/CustomerDashboard.tsx` — change `useRecentOrderItems` SQL to require docs/sections; change `handlePickProduct` to navigate without creating.
- `supabase/migrations/<timestamp>_cleanup_empty_draft_items.sql` — one-shot delete of orphan empty drafts older than 1 hour.

## Out of scope

- Reworking the broader order/draft lifecycle.
- Surfacing orphan cleanup as a scheduled job (already covered conceptually by `cleanup-stale-drafts` Edge Function — can be wired up separately if needed).
