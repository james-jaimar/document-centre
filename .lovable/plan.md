<final-text>## What actually broke

This is not “the orders are gone”. The data for INV-00017 is still in the database.

For that order I verified:
- the `orders` row exists
- it is submitted (`submitted_at` is set)
- it has pricing and branch data
- it has a real `order_jobs` row with full `configuration.preview` data and the correct A4 snapshot

The reason the admin page looks blank is that the page is now loading the parent `orders` row successfully, but the child queries (`order_jobs`, `order_documents`, `order_addresses`, `timeline_events`, `messages`, `payments`) are coming back empty in the browser.

## Root cause

### 1. RLS drift between `orders` and child tables
`orders` has a platform-admin override policy:

- `Platform admins can manage all orders`

But the child tables do not mirror that access model.

Examples:
- `order_jobs_select_policy`
- `order_documents_select_policy`
- `order_addresses_select_policy`
- `timeline_events_select_policy`
- `messages_select_policy`
- `payments_select_policy`

These policies rely on:
- `user_can_read_order(...)`
- or `user_is_staff_for(...)`

Those helpers do **not** treat `platform_admin` as allowed staff.

Result:
- platform admin can read the order row
- platform admin cannot read the order’s jobs/docs/messages/timeline/payments
- UI renders header + side panels but “No jobs in this order” in the main pane

That is why the recent FK/query fix appeared to “break” the page: it fixed the hard failure on the main order query, which exposed the deeper policy mismatch that was already sitting underneath.

### 2. Order lifecycle drift
Submitted orders are still left with legacy `order_status = 'draft'`.

I confirmed there are submitted orders where:
- `submitted_at IS NOT NULL`
- but `order_status = 'draft'`

That is a serious integrity smell. The app is mixing:
- legacy cart/draft status
- newer admin/customer/payment/fulfilment status columns
- and separate order/job creation paths

This is exactly the “layers of rubbish” problem: the system currently works by multiple parallel status models rather than one authoritative lifecycle.

### 3. Frontend order-detail code is too fragile
`fetchOrderDetail` does 8 separate client-side queries and assumes child tables will behave consistently under RLS. They no longer do.

That fan-out pattern makes the UI vulnerable to:
- partial RLS mismatches
- empty-state lies (“no jobs”) when data actually exists
- future regressions whenever a table policy changes

### 4. Minor UI drift also showed up
The console warnings about refs in `OrderDeliveryTab` and `OrderedByTab` are not the main bug, but they are another sign this area has become patch-on-patch and needs cleanup, not more isolated fixes.

## Fix plan

### A. Fix the real access-control bug first
Add explicit platform-admin read policies for every child table used by order detail and order list screens:

- `order_jobs`
- `order_documents`
- `order_addresses`
- `timeline_events`
- `status_history`
- `messages`
- `payments`
- `job_proofs`
- `order_invoices`
- `order_pricing_snapshots`

Pattern:
- keep existing customer/staff rules
- add a dedicated `has_role(auth.uid(), 'platform_admin')` override
- do not weaken customer visibility rules
- do not make tables publicly readable

This restores parity with `orders` and stops platform-admin sessions from seeing hollow orders.

### B. Normalize the order lifecycle
When checkout creates the placed order, the placed order must no longer remain `order_status='draft'`.

Set a consistent submitted state for placed orders, for example:
- `order_status = 'confirmed'` or `submitted`

Then update all reads to use one coherent rule set:
- cart flow reads `order_status='cart'`
- editable project flow reads true draft/quoted items only
- placed order flow reads submitted/confirmed/production/completed/cancelled states

This removes the hidden contradiction of “submitted draft orders”.

### C. Refactor order detail into one authoritative data path
Replace the current fragile fan-out in `fetchOrderDetail` with a single server-side read surface.

Preferred cleanup:
- create one DB function or one Edge Function for order detail aggregation
- validate access once
- return order + jobs + docs + messages + payments + profile in one shape

Benefits:
- one permission boundary
- no partial empty states from mixed RLS outcomes
- much easier to test
- less duplicated logic across admin / branch / customer detail pages

### D. Clean up the frontend detail screens
Refactor admin, branch, and customer order detail pages to consume the same normalized response shape.

Also clean up:
- render-time `setSelectedJobId(...)` in detail pages → move to `useEffect`
- misleading empty states → distinguish between:
  - truly no jobs
  - failed child data load
  - unauthorized child data
- Radix Tabs warnings by ensuring tab content wrappers remain ref-safe

### E. Add guardrails so this cannot happen again
Add regression coverage for:
1. platform admin viewing a tenant order
2. tenant staff viewing the same order
3. customer viewing own order
4. an order with jobs must never render as “No jobs” if jobs exist in DB
5. submitted orders must never remain `order_status='draft'`

## Files / areas to change

### Database
- new migration for platform-admin SELECT policies on child order tables
- new migration to normalize submitted order lifecycle status
- possibly a DB function for `get_order_detail(...)`

### Frontend
- `src/lib/orders/queries.ts` — replace fan-out client query strategy
- `src/hooks/useOrders.ts` — switch to normalized detail fetch
- `src/pages/admin/AdminOrderDetail.tsx`
- `src/pages/branch/BranchOrderDetail.tsx`
- `src/pages/dashboard/CustomerOrderDetail.tsx`
- `src/components/orders/detail/OrderSummaryTab.tsx`
- `src/components/orders/detail/JobDetailPanel.tsx`
- `src/components/orders/detail/OrderDeliveryTab.tsx`
- `src/components/orders/detail/OrderedByTab.tsx`

### Checkout / order creation
- `src/hooks/useCart.ts`
- `supabase/functions/order-engine/index.ts`

## Verification

### Data integrity
- INV-00017 opens for platform admin and shows its real job row
- same order opens for tenant staff
- same order opens for the owning customer
- submitted orders no longer remain `order_status='draft'`

### UI
- admin order list shows job rows again
- admin detail center panel no longer says “No jobs in this order” when jobs exist
- customer detail page shows items/files correctly
- no ref warnings from tabs in console

## Important note

The recent FK/profile work was not the true cause of the blank order body. It fixed one broken relationship query, but because this area is split across inconsistent RLS, mixed status models, and multi-query frontend reads, the next hidden fault immediately surfaced.

So the right move here is not another tiny patch. It is:
1. fix the RLS mismatch,
2. normalize submitted order status,
3. collapse order detail into one authoritative read path,
4. then clean the three detail screens to consume that one source of truth.</final-text>