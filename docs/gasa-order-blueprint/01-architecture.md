# The order system: how it works and why

This is the part worth reading slowly. The shape of this system is the result of
about a year of things going wrong in production. Each rule below exists because
something broke without it.

## The one-sentence version

An **order** is a container of money and status. A **job** is one thing being
made. The browser never writes to either — it asks a single server function to
do it, and that function is the only place the rules live.

## 1. Orders and jobs

An order has one customer, one address, one set of money fields, one status.
An order has one or more **jobs**. A job is one product being produced: its own
quantity, its own price, its own production status, and — crucially — its own
frozen copy of what was ordered.

Why split them? Because a real order rarely finishes as one unit. Two of the
three items are ready, one is held for a proof. The order's status has to be the
truthful summary of its jobs, not something a human typed.

In GASA a job is one apparel product in the order: 40 black tees, front print,
this artwork. Same shape, different content.

## 2. Nothing is priced twice

When an order is placed, the price is written into the job row (`net_price`,
`vat_rate`, `gross_price`) and the full calculation is stored in
`order_pricing_snapshots`. The pricing engine is never consulted again for that
order.

This matters more than it sounds. Prices change, discounts expire, tax rates
move. An order re-priced at read time will silently disagree with the invoice
the customer already has. Freeze it at order time.

The same applies to the product itself: `order_jobs.product_snapshot` and
`configuration` hold an immutable JSON copy of exactly what was ordered. If the
brand owner edits or deletes the product tomorrow, historical orders still
render correctly. Never join a historical order back to the live catalogue.

## 3. Totals are computed by the database, not the app

`sync_order_amounts(order_id)` is the only thing that sets an order's money
fields. It sums the jobs' `net_price` plus `order_adjustments.amount`, applies
discount, delivery and VAT, and derives `amount_due` and `payment_status`.

A trigger on `order_jobs` calls it after every insert, update or delete. So
touching a job can never leave the order total stale.

**Trap we hit:** a feature set every job's price to zero because the order had a
single flat price. The trigger then dutifully recomputed the total as zero and
wiped the real amount. The fix was to put the flat amount in
`order_adjustments` — a row the totals function sums — rather than trying to
hold it on the order. If a price does not live in a job or an adjustment, it
does not survive.

## 4. Four statuses, and only one of them is typed by a human

- **`admin_status`** — what staff see and drive: new → under review → approved →
  in production → sent to print → QA → ready → dispatched → completed, plus
  on hold and cancelled.
- **`customer_status`** — the softened public version. Customers never see
  internal stages.
- **`payment_status`** — unpaid / requested / part paid / paid / failed /
  refunded. Derived from payments, never typed.
- **`fulfilment_status`** — pending / in production / ready / dispatched /
  delivered / collected / cancelled.

Job statuses roll **up** into the order via `rollup_order_status(order_id)`:
any job on hold → order on hold; all jobs completed → order completed; all ready
or completed → ready; any awaiting proof → under review; and so on. Order status
cascades **down** to jobs when staff drive the order forward.

`map_customer_job_status()` is the single translation from internal job status to
what the customer is shown. One function, one place. Do not scatter this logic
into components — we did, and the two versions drifted.

Rules worth keeping: `dispatched` requires a tracking number. `completed` sets
the fulfilment status from the fulfilment type (delivery → delivered, collection
→ collected). Cancellation always wins over everything else.

## 5. All writes go through one server function

`order-engine` is a single edge function with an `action` switch:
`createOrderWithJobs`, `updateOrderStatus`, `updateJobStatus`,
`recordPaymentEvent`, `cancelOrder`, `addOrderAdjustment`, `updateOrderPricing`,
`updateOrderAddress`, `adminChangeQuantities`, `customerChangeQuantities`,
`reorderOrder`, and so on.

Why one function rather than letting the client write rows?

- Price, status and payment changes need to be **atomic with their side
  effects** — timeline entry, status history, email, totals sync. A client that
  writes a row and then fails to send the email leaves a lie in the database.
- Every action re-checks access server-side. Row-level security is the second
  wall, not the first.
- It gives one place to add a rule later. The number of times a rule needed to
  apply "everywhere an order changes" is the whole argument.

Access is checked by `assertOrderStaffAccess` on staff actions and by ownership
on customer actions. Both run before anything is written.

## 6. Timeline and history are two different things

- `status_history` is the machine record: from status, to status, who, when.
  Written on every transition, never edited.
- `timeline_events` is the human record: messages, notes, events, with a
  `visibility` of `admin`, `customer` or `both`.

**Only those three values exist.** There is no `internal` — internal notes use
`admin`. We tried to invent a fourth value and broke the customer view.

Staff messaging and private internal notes share this one table, separated only
by `visibility`. That is what makes "what can the customer see?" answerable with
a single filter instead of trust.

## 7. Money events are append-only

`payments` rows are facts that happened: provider, reference, amount, status,
raw provider payload. `order_payment_attempts` records the tries. The order's
`amount_paid` is derived from them; never set it directly. Refunds are recorded
as their own events, not by editing the original payment.

`order_invoices` holds issued documents with their own number. Invoice numbers
come from `issue_invoice_number()`, which is sequence-backed and gapless per
brand owner — an accountant will eventually ask about gaps.

## 8. Numbering

`number_sequences` holds one counter row per (app, tenant, type). Order and
invoice numbers are issued by `next_number()` inside a single atomic
`UPDATE ... RETURNING`, so two simultaneous orders can never take the same
number. Do not generate numbers in application code, and never from a count of
existing rows.

## 9. Tenancy

Every order-side table carries `tenant_id` (in GASA: the brand owner) and an
optional `branch_id`. Access rules are written against these columns, and the
helper functions are `SECURITY DEFINER` so policies don't recurse.

The isolation rule that saved us: a signed-in user who belongs to brand A must
not see brand B's data even if the URL says brand B. Resolve the tenant from the
URL, and let the database — not the front end — enforce that queries stay inside
it.

## 10. The order of operations when an order is placed

1. Validate the address and the cart server-side.
2. Issue the order number.
3. Insert the order with the frozen money fields.
4. Insert the jobs with their frozen snapshots and prices.
5. Write the pricing snapshot.
6. Let the trigger sync totals and roll up status.
7. Write the timeline entry and status history.
8. Fire the confirmation email.

If step 8 fails the order still stands — email is fire-and-forget and logged,
never a reason to fail a paid order. That asymmetry is deliberate.
