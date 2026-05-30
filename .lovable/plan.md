## Postnet polish pass — 7 fixes

### 1. Branch portal: Postnet-style theming
Today the branch portal (`/branch/*`) uses generic utilitarian styling. The customer storefront already pulls Postnet brand (red, logo, Postnet wordmark). Apply the same tenant branding to the branch portal shell:
- Branch sidebar header: replace generic "Branch Portal" subtitle styling with tenant logo + tenant name in branded color (already half-done — extend to nav active state, buttons, accents).
- Use `useTenantBranding()` to drive sidebar background, active item color, and primary buttons (Mark as Paid, Record Payment, Message Send) so PostNet renders red, other tenants render their own brand.
- Keep dense/utilitarian data layouts — only restyle chrome (sidebar, headers, primary buttons, badges).

Files: `src/pages/branch/*` layout + sidebar, `src/components/branch/*` (or wherever the branch shell lives), tenant branding hook already exists.

### 2. Notify customer when branch sends a message
When branch/admin posts a message via the order Timeline, fire a transactional notification to the customer:
- New event key `new_message` in `send-order-email` with subject `New message on order {orderNo}` and a short body + View Order link.
- Trigger in `order-engine` `sendMessage` case when `sender_role !== 'customer'` and message visibility is customer-facing.
- Throttle: don't send more than once per 5 minutes per order (check last `email_outbox` entry for same `related_id` + event).

### 3. In-app unread message indicator on customer side
Mimic Printjob: show a badge on the order row & detail screen when there are unread messages from staff.
- Use existing `order_messages` table (or whatever the timeline table is). Add `read_by_customer_at` (and corresponding `read_by_staff_at`) timestamp.
- DB migration: add nullable timestamptz columns + index on `(order_id, read_by_customer_at)`.
- New view/RPC `get_unread_message_counts(user_id)` returning `{ order_id, unread_count }` for current customer.
- `CustomerOrders.tsx`: red dot + count badge per order row.
- `OrderDetail` (customer): mark messages read on mount; subscribe to Supabase realtime channel for `order_messages` insert so new messages appear without hard refresh.
- Mirror the same for staff (`read_by_staff_at`) so admin/branch Msgs column populates (currently always 0 in screenshot).

### 4. New orders should not auto-jump to "In Production"
Screenshot shows freshly placed unpaid order INV-00067 as **In Production**. The engine sets `admin_status: "new_order"` on creation, so something else is promoting it. Likely culprit: the checkout/payment success path (or storefront submit) is overwriting `admin_status` to `in_production` regardless of payment state.
- Audit: `create-checkout`, `stripe-order-webhook`, `payfast-itn`, `claim-anonymous-orders`, plus any frontend mutation that updates `admin_status`.
- Fix policy: on order submission, `admin_status` stays `new_order` until payment is confirmed (`paid` or `part_paid`) AND/OR a branch user explicitly moves it forward. Unpaid orders display under the **New** filter, not **In Production**.
- Update the `BranchOrders` default tab to "New" so freshly arrived unpaid orders are visible without clicking around.

### 5. Request Payment email — attach invoice + already-fixed logo
The `payment_request` event currently sends no attachment. The "logo still big" complaint indicates the fix from the previous turn either wasn't picked up by this template branch or there's a second `<img>` tag elsewhere.
- In `send-order-email`: extend the invoice-fetch + `attachments` block (currently gated on `invoice_sent`/`order_received`) to also include `payment_request`. Auto-generate a proforma first (call `generate-invoice-pdf` with `kind: "proforma"`) if one doesn't already exist for the order, then attach it.
- In `requestPayment` (`src/lib/orders/mutations.ts`): no client change needed — server-side handles the proforma creation.
- Audit the email HTML template for **all** `<img>` logo tags and apply the same proportional sizing rules (`max-width:180px; max-height:48px; width:auto; height:auto; display:block`). The previous fix may have only touched one of multiple templates.

### 6. Customer-side shows both "Awaiting Payment" AND "Paid"
INV-00053 in the customer Orders list shows both pills. Cause: customer-side renders `customer_status` (awaiting_payment) **and** `payment_status` (paid) side-by-side, and `recordPaymentEvent` updates `payment_status` to `paid` but doesn't advance `customer_status` past `awaiting_payment`.
- Fix in `recordPaymentEvent` (order-engine): when payment becomes fully paid, also set `customer_status` to `in_production` (or whatever the next stage is — likely `in_production` since work begins). Keep `admin_status` separate (admin still decides production stage; see #4).
- Alternative defensive fix on the UI: hide the `customer_status: awaiting_payment` badge when `payment_status === 'paid'`. Apply both.

### 7. Payment Received email — attach paid invoice PDF
After payment, `recordPaymentEvent` triggers `triggerInvoice(... "invoice")` + `triggerEmail(... "payment_received")` in parallel. The email fires before the invoice PDF is committed, and `payment_received` has no attachment logic.
- Sequence them like `order_received`: await invoice generation, pass returned `invoice_id` into `triggerEmail`.
- In `send-order-email`: add `payment_received` to the invoice-fetch + attachment branch so the paid invoice (kind: `invoice` or `receipt`) is attached.

---

## Technical notes

- Edge functions touched: `order-engine`, `send-order-email`, possibly `generate-invoice-pdf` (re-use existing).
- Migrations: add `read_by_customer_at` / `read_by_staff_at` to messages table; verify GRANTs and RLS preserved.
- Realtime: enable Supabase realtime on the messages table (publication add).
- All edge functions redeployed after edits.

## Out of scope (this pass)
- Push notifications / email digests for new messages beyond the single per-message email in #2.
- Reworking the storefront order flow itself — only the post-submission status assignment is changing.
