
# Admin Order Editing + Customer Impersonation

Three improvements to the tenant admin portal, scoped to match the reference system from Mark's other business.

---

## 1. Editable Pricing tab (admin)

Today the Pricing tab is read-only. Allow Owner/Admin to adjust prices on a submitted order, with everything downstream re-syncing automatically.

**Editable controls:**
- **Fulfilment toggle** — switch between Collection and Delivery; when Delivery is selected, edit the delivery amount and description (free-form text).
- **Delivery amount** — direct edit (rand value), even when fulfilment is already Delivery.
- **Discount amount** — direct edit.
- **Per-job net price** — small pencil icon next to each job line; edits override the engine-calculated price.
- **Manual line items** — add/remove ad-hoc adjustments (description + amount, positive only — e.g. "Rework fee", "Extra binding"). Stored as new rows on a small `order_adjustments` table.

**Recalculation:**
- On any save: server-side function recomputes `subtotal`, `vat_amount` (15%), `total_amount`, and `amount_due = total - amount_paid`.
- Existing `sync_order_amounts` DB function is extended to include manual adjustments + delivery edits.

**Audit:**
- Every edit writes a `timeline_events` entry (internal-visible only) showing what changed, old → new, and which admin did it.

---

## 2. Underpaid order → customer payment request

When an admin edit increases `total_amount` so that `amount_due > 0` on a previously-paid order:

- **DB**: `payment_status` flips back to `partial` (existing enum value); `customer_status` rolls up to `awaiting_payment` via existing `rollup_order_status`.
- **Customer portal**: the order detail page already renders amount due — add a prominent "Pay outstanding balance" banner + button when `amount_due > 0` on a submitted order. Reuses the existing checkout/payment flow scoped to the delta.
- **Email**: trigger the existing `request-payment` email path automatically on this transition (idempotent — once per balance-change event, not on every edit). Includes the new total, the delta, and a deep link to the order.

No new payment gateway work — leverages existing Stripe + EFT flows.

---

## 3. Delivery address editing

Already partially present (pencil icon on the Delivery Address tab) but verify and finalise:
- Allow Owner/Admin/Sales to edit the shipping address on a submitted order.
- Writes to `order_addresses` (existing table) and logs a timeline event.
- No impact on pricing unless the user also changes the delivery amount in the Pricing tab.

---

## 4. "Log in as customer" (cart-building impersonation)

A safer, scoped version of full impersonation: admin stays signed in as themselves, but can build a draft cart on the customer's behalf. Customer sees the cart on their next login and just pays.

**Where it lives:**
- New "Start order for customer" button on the Admin Customer Detail page (`AdminCustomerDetail.tsx`), and on the Ordered-by panel of an existing order.

**How it works:**
- Admin clicks → modal confirms the target customer.
- New edge function `start-customer-order` (uses service-role internally, validates caller is Owner/Admin via `user_is_tenant_admin`) creates a new `orders` row with status `cart`, `ordered_by_profile_id = customer.id`, `created_by_admin_profile_id = admin.id` (new column for audit).
- Admin is redirected into the existing `/admin/orders/:id/new` order-builder flow with the new cart pre-selected — they use the normal product configurator, file uploads, etc.
- When admin is done, they click "Send to customer" → order stays in `cart` status; an email goes to the customer ("Your printer has prepared an order for your review — log in to pay") with a deep link.
- On the customer's next login, the cart appears in their portal with a "Prepared by [tenant] on your behalf" badge. They can edit, remove items, or proceed to checkout normally.

**Permissions:**
- Restricted to tenant Owner + Admin only (enforced both in UI and in the edge function).
- Every action on the impersonated cart writes a timeline event tagged with the acting admin's profile id, so there's a full audit trail.
- Admin **cannot** complete payment on the customer's behalf — payment always requires the customer to log in. This avoids any liability around stored payment methods.

---

## Technical Details

**Schema changes (one migration):**
- `order_adjustments` — `id`, `order_id`, `description`, `amount`, `created_by`, `created_at`. RLS: tenant staff can CRUD for their tenant's orders.
- `orders.created_by_admin_profile_id` — nullable uuid, references `profiles(id)`. Indicates an admin-prepared cart.
- Extend `sync_order_amounts` to include `sum(order_adjustments.amount)` in subtotal.

**Files to add / edit:**
- `src/components/orders/detail/OrderPricingTab.tsx` — convert read-only rows to editable controls, wire mutations.
- `src/components/orders/detail/AddressEditDialog.tsx` (new) — modal for delivery-address edits.
- `src/lib/orders/mutations.ts` — `updateOrderPricing`, `addOrderAdjustment`, `removeOrderAdjustment`, `updateJobNetPrice`, `updateOrderAddress`, `startCustomerOrder`.
- `supabase/functions/start-customer-order/index.ts` (new edge function).
- `supabase/functions/order-engine/index.ts` — extend to handle admin pricing overrides and re-trigger payment request email.
- `src/pages/admin/AdminCustomerDetail.tsx` — "Start order for customer" button.
- `src/pages/dashboard/Cart.tsx` and order detail — surface "Prepared by [tenant]" badge + "Pay outstanding balance" banner.

**Out of scope (explicitly):**
- Full session impersonation (rejected in favour of cart-building only).
- Negative manual line items / promo codes (handled by existing discount field).
- Refund flow for overpaid orders (no edits will ever produce a negative `amount_due` — overpayments are kept as credit, surfaced separately later).
