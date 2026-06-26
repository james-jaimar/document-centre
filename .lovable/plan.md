## Problem

Clicking **Reorder** today calls the `reorderOrder` engine action which **immediately creates a brand-new live order** with the original line items, prices and delivery details copied verbatim. The only UI is a payment dialog (and even that is skipped when no online gateway is available — the customer is silently redirected to the new order detail page).

There is no:
- Review screen
- Quantity editing
- Per-item removal
- Delivery address / fulfillment choice
- Notes / PO change
- Confirm / cancel step

This is not what customers expect from a "Reorder" button on an e-commerce platform.

## Industry-standard reorder UX

Looking at how Amazon ("Buy it again"), Mimeo, Vistaprint, Moo and Shopify handle reorder, the consistent pattern is:

1. **Reorder ≠ Place Order.** Click → items are cloned into the cart (or a "review" state), not submitted.
2. Customer lands on a **Review & Confirm** screen showing every line item with thumbnail, spec summary, qty editor, unit + line price, and a "Remove" action.
3. Delivery method / address and notes are editable before checkout.
4. Totals (subtotal, delivery, VAT, total) recalculate live.
5. Explicit **Place Order** button → then payment step.
6. An "Edit in cart" escape hatch for deeper changes (e.g. swapping a binding option).
7. Out-of-stock / discontinued / price-changed items are flagged with an inline warning before checkout.

## Proposed flow

```text
[Reorder button]
       │
       ▼
reorderOrder (server)            ← now returns a DRAFT order, not a live one
       │
       ▼
Review & Confirm modal/page      ← new UI
  • line items (qty editable, removable)
  • delivery address / method
  • notes, PO, cost centre
  • live totals
  • price-change & availability warnings
       │
       ├── "Edit in cart" ──► /cart (existing)
       ├── "Cancel"       ──► discard draft
       └── "Place order"  ──► submit + existing ReorderPaymentDialog
```

## Scope of changes

### Backend (`supabase/functions/order-engine/index.ts`)

- Split `reorderOrder` into two steps:
  1. `reorderOrder` → clones jobs + addresses into a **draft** order (`admin_status = 'cart'` / `order_status = 'draft'`, same model used by the regular cart flow), re-prices each job against the **current** rate card, and returns the draft `order_id` plus a `changes[]` array (e.g. `{ job_id, change: "price_increased", old: 120, new: 135 }`, `{ change: "option_unavailable", … }`).
  2. `submitReorder` (new action, or reuse the existing cart-checkout submit path) → flips the draft to a live order once the customer confirms.
- Permissions and tenant/branch ringfencing stay exactly as today.

### New review UI

- New component `src/components/customer/ReorderReviewDialog.tsx` (modal on desktop, full-screen sheet on mobile) containing:
  - Header: "Review your reorder — Order #INV-xxxx"
  - Line item rows: thumbnail, product family, spec summary (size, pages, binding, finish), qty stepper, unit price, line total, remove (×).
  - Delivery block: current address + "Change" link → opens existing address picker.
  - Fulfillment choice (Collect / Deliver) when the branch supports both.
  - Notes, PO, cost centre fields, pre-filled from source order.
  - Warning banners for any `changes[]` entries returned by the server.
  - Totals panel (subtotal, delivery, VAT, total).
  - Footer: **Cancel** · **Edit in cart** · **Place Order**.
- Component is mounted from both existing entry points: `CustomerOrders.tsx` and `CustomerOrderDetail.tsx`, replacing the current "fire and forget" handler.
- On **Place Order**, call the submit action, then hand the resulting live order to the existing `ReorderPaymentDialog` (no change to the payment leg — that part is working).

### Hooks / data plumbing

- `reorderOrder` mutation in `src/lib/orders/mutations.ts` updated to return the new draft + changes payload.
- New `submitReorder` mutation alongside it.
- Reuse `useOrderBuilder` / cart hooks where they already model qty edits and removal so we don't reinvent pricing.

### Edge cases handled

- Source order had items that are now disabled at branch level → flagged + auto-removed with a notice.
- Source price differs from current price → flagged inline; total reflects current price.
- Source delivery address has been deleted → falls back to customer's default with a "please confirm address" warning.
- Customer abandons the modal → draft remains in their cart so they can return to it (same as any other cart).

### Out of scope (explicitly not changing)

- The payment dialog and PayFast/Stripe handoff — they already work correctly.
- The admin-side reorder/duplicate flow (different surface, different requirements).
- The `Buy it again` carousel on the dashboard — left as is for this pass.

## Deliverables

1. `order-engine`: `reorderOrder` returns draft + changes; new `submitReorder` action.
2. `src/components/customer/ReorderReviewDialog.tsx` (new).
3. `src/lib/orders/mutations.ts`: updated typings + new submit helper.
4. `src/pages/dashboard/CustomerOrders.tsx` and `CustomerOrderDetail.tsx`: wire the new dialog in front of the existing payment dialog.
5. Light copy/UX polish: button label "Reorder" stays; CTA inside dialog reads "Place Order".
