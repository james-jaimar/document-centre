
## Bugs to fix

### 1 & 2 — Preview missing on admin/tenant order detail
Confirmed via DB inspection: even orders placed AFTER the recent `useCart.ts` fix (INV-00014, 15, 16) save `configuration.preview` with empty `thumbnails`/`pageRoles`/`colorFlags`. INV-00013 worked. The `buildPreviewSnapshot` call in `usePlaceOrder` is silently producing zero pages.

Most likely cause: at place-order time, `usePlaceOrder` fetches `document_sections` and `documents` for the cart's order_items, but for cart items that came through the **edit-cart-item clone** path (`useEditCartItem`), the cloned sections don't always have `document_id` populated correctly relative to the cloned documents — and `buildPageSequence` then skips every section because `documents.find((d) => d.id === section.document_id)` returns nothing.

Fix:
- Add diagnostic logging in `usePlaceOrder` (sections.length, documents.length, cloned page count per job) so we can confirm.
- In `buildPreviewSnapshot`, when a section has no matching document, fall back to the only document for that order_item (when there's exactly one), or to `documents[sortIndex]`.
- Also: make sure all cart items query their sections/documents successfully — the current `sections` and `documents` queries only fetch by `order_item_id` (correct), but if `useEditCartItem` re-uses the original `order_item_id` for sections, the lookup mismatches.

### 3 — Collection branch not shown on order detail
The cart correctly sends `branch_id` to the engine and the engine writes it to `orders.branch_id` (verified for INV-00016 = `3f648164-…`). But:
- `OrderDeliveryTab` only renders rows from `order_addresses` and shows "No address" when nothing exists for `delivery`/`billing`. Collection orders intentionally have no address row, so the tab displays as if the order has no fulfilment info.
- Customer + admin pages never resolve `orders.branch_id → branches.name/address` to display "Collect from: PostNet Arcon Park — Vereeniging".
- `fulfillment_type` is also never set on the order, so we can't tell collection vs delivery without inspecting `branch_id`.

Fix:
- In `usePlaceOrder` (client) include `fulfillment_type: deliveryMethod` in the engine payload, and in `order-engine.createOrderWithJobs` write it onto `orders.fulfillment_type`.
- Extend `fetchOrderDetail` in `src/lib/orders/queries.ts` to also fetch the linked branch (`branches: branch_id (id, name, address, city, province, postal_code, phone, email)`).
- Update `OrderDeliveryTab` to: when `order.fulfillment_type === 'collection'` (or `branch_id` set with no delivery address), render a "Collection from branch" panel showing branch name, address, contact details. Otherwise render the existing delivery + billing addresses.
- Same render logic added to `CustomerOrderDetail.tsx` delivery section.

### 4 — Other discrepancies found while exploring

a) **`OrderedByTab` is missing the customer's phone number** and any link to the underlying profile. Add phone (resolved from customer profile) and a "View customer" link for staff.

b) **Pricing tab** never shows a "Delivery: R0" line for collection orders nor a "Method: Collection at PostNet Arcon Park" header. Add a one-line fulfilment summary at the top of `OrderPricingTab` (and `OrderSummaryTab`).

c) **`OrderSummaryTab`** shows "Source" as `storefront` but never shows fulfilment method. Add a "Fulfilment" row driven by `order.fulfillment_type` + branch name.

d) **`AdminOrderDetail` header** shows `payment_status` chip but never the `admin_status` chip. Add it next to the order number for at-a-glance state (esp. for cancelled orders).

e) **Cancelled-order guard**: After cancel, the "Mark as Paid" / "Record Payment" / "Refund" buttons remain visible if there's still amount_due. Hide them when `admin_status === 'cancelled'`.

## Plan of work

1. **Preview fix (1, 2)**
   - Add fallback document resolution in `buildPreviewSnapshot` (`section.document_id` missing → use the item's first document).
   - Verify INV-00016 by re-running place flow on a fresh cart and inspecting `configuration.preview.thumbnails`.

2. **Branch / fulfilment surfacing (3)**
   - Engine: write `fulfillment_type` into `orders` from payload.
   - Client `usePlaceOrder`: send `fulfillment_type`.
   - `queries.ts`: join `branches` for both admin + customer detail fetches.
   - `OrderDeliveryTab`: render branch-collection card when applicable.
   - `CustomerOrderDetail.tsx`: same.

3. **Polish (4a–e)**
   - `OrderedByTab`: phone + profile link.
   - `OrderSummaryTab`: fulfilment row.
   - `OrderPricingTab`: collection / delivery line.
   - `AdminOrderDetail` header: admin_status chip + hide payment buttons when cancelled.

4. **No data backfill** — old broken previews (INV-00014/15/16) stay empty (acknowledged in earlier session). New orders going forward will work.

5. **Test end-to-end**: place a fresh collection order, confirm preview button + branch info appear in admin, tenant admin, and customer views; place a delivery order, confirm address renders.

## Out of scope
- Backfilling INV-00014/15/16 previews (sources unavailable).
- Changing the cancel-order edge function (already deployed and working).
- Refactoring the role/permission model.
