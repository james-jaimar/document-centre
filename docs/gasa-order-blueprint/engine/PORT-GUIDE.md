# Porting the order engine

Source: `../reference/order-engine.original.ts` — the real Document Centre
engine, 3,526 lines, unedited. It is one Supabase edge function with an
`action` switch. Port it by **deleting**, not rewriting: the deletions are
listed below and the remainder runs as-is against `02-schema.sql`.

Line numbers refer to the original file as shipped in this pack.

## Shape of the file

```
1–10      imports (supabase-js, refunds, activate-held-order, supplier-mirror)
12–145    helpers: json(), err(), access check, email/invoice triggers, clients()
146–470   pre-flight guards: fulfilment, branch gate, credit, sample pack, tax
470–943   createOrderWithJobs  ← the important one
943–1330  status transitions and payment recording
1330–1550 refunds
1543–1880 documents, proofs, messages
1882–2130 reorder, cancel
2131–2470 timeline, pricing edits, adjustments, addresses, totals sync
2470–3260 quantity changes, fulfilment changes, refund completion
3260–3520 the request handler and the action switch
```

## Keep

| Action | Why |
| --- | --- |
| `createOrderWithJobs` | The whole order-placement sequence. |
| `updateOrderStatus` / `updateJobStatus` | The status model with its cascade and guards. |
| `recordPaymentEvent` | Append-only payment facts + totals resync. |
| `cancelOrder` | Cancellation beats everything; reverses charges. |
| `addOrderAdjustment` / `removeOrderAdjustment` | The only safe way to put money on an order that isn't a job. |
| `updateOrderPricing` / `updateJobNetPrice` | Staff price overrides with history. |
| `updateOrderAddress` | Validated server-side. |
| `adminChangeQuantities` / `customerChangeQuantities` | Re-price, re-snapshot, re-total. |
| `attachOrderDocument`, `createJobProof` | Artwork and mockup approval. |
| `sendMessage`, `logTimeline` | Timeline, incl. internal notes at `visibility: 'admin'`. |
| `reorderOrder` | Clone from frozen snapshots — the pattern GASA wants for repeat buys. |
| `syncOrderTotals`, `recomputeAndNotify` | Totals + notify in one atomic path. |
| `assertOrderStaffAccess`, `clients()`, `json()`, `err()` | Plumbing. |

## Delete

| Lines (approx.) | What | Why |
| --- | --- | --- |
| 4 | `import { mirrorSupplierOrders }` | Supplier tenants — out of scope. |
| 189–239 | `checkBranchGate` | No branch/subscription gate in GASA. |
| 240–314 | `resolveCreditFacility`, `accountBalance` | Credit accounts — out of scope. |
| 350–449 | `resolveSamplePackConfig`, `jobFamilyId`, `checkSamplePack` | Print sample packs. |
| 1093–1188 | `propagateSupplierStatus` | Supplier mirroring. |
| 1429–1542 | `raiseRefund`, `refundPayment` | Keep only if GASA takes card payments on day one; otherwise delete with the `../_shared/refunds.ts` import. |
| any `print_ready_*`, `imposition_*`, `enqueue-print-ready` references | Print pipeline. |
| `is_sample_pack`, `supplier_*`, `source_order_id` branches | Columns that do not exist in `02-schema.sql`. |

After deleting, search for `supplier`, `sample_pack`, `print_ready`,
`imposition`, `credit`, `branch_gate` and remove the dangling call sites. The
compiler finds the rest.

## Replace

- `checkFulfilmentAllowed` (146–188) reads tenant settings to decide whether
  collection is offered. GASA is delivery-only at first: reduce it to a check
  that a delivery address exists.
- `tenantTaxFraction` (450–469) reads the tenant's VAT rate. Keep the shape,
  point it at wherever GASA stores the brand owner's tax rate. Do not hardcode
  15%.
- `triggerEmail` / `triggerInvoice` (80–124) call Document Centre's
  `send-order-email` and `generate-invoice-pdf` functions. Point them at GASA's
  equivalents. Keep them **fire-and-forget**: a failed email must never fail a
  paid order.

## Rules not to "tidy up"

1. Every write goes through this function. Do not let the browser write to
   `orders` or `order_jobs` directly, even for something small.
2. Prices are frozen at order time. Never re-price a historical order.
3. Order totals are only ever set by `sync_order_amounts()`. If an amount is
   not a job price or an adjustment row, it will be wiped by the trigger.
4. `timeline_events.visibility` is `admin`, `customer` or `both`. Nothing else.
5. `dispatched` requires a tracking number. Keep the guard.
6. Side effects (email, invoice) run **after** the response is formed, via the
   `sideEffects` closure at the bottom of the switch. Keep that pattern — it is
   why a slow mail server can't time out a checkout.
