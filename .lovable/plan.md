## What's actually in the system today (verified)

- **Customer self-service amend exists.** `ManageOrderPanel` → `order-engine.customerChangeQuantities` lets the ordering customer change or remove item quantities. It's gated to `admin_status` in (`new_order`, `under_review`) and every job in (`new`, `awaiting_payment`, `proof_pending`, `on_hold`) — i.e. before production starts. Prices scale linearly with quantity, totals resync, and if the new total drops below what was paid it auto-raises a `refund_pending` adjustment.
- **Real provider refunds already work** — but only from one place. `_shared/refunds.ts` refunds through the original Stripe/PayFast credentials (idempotent, async-confirmed by webhook). It is reached from the **Pricing tab → "Refund now"** button on a `refund_pending` adjustment, or "Mark manual" for EFT/cash.
- **Gap 1 — the header "Refund" button is ledger-only.** `RefundDialog` calls `order-engine.refundPayment`, which just inserts a negative `payments` row and adjusts `amount_paid`. It never touches Stripe/PayFast, so a staff member using the obvious top-bar button believes they refunded the customer when no money moved.
- **Gap 2 — admin cannot amend quantities.** Staff can change fulfilment, edit a job's net price, add adjustment lines, or cancel. There is no admin equivalent of `customerChangeQuantities`, so a phoned-in "make it 200 not 100" has no clean path.
- **Gap 3 — no upward-amendment payment path.** If an amendment increases the total on a paid order, nothing prompts the customer for the balance.

## Recommended model (industry norm)

Cancel-and-reorder is the wrong default: it loses the order number, the timeline, the uploaded artwork, the invoice chain and the production position. Best practice in print MIS is **amend in place, settle the delta**:

```text
Change request
  ├─ before production, unpaid   → amend qty; proforma reissued; nothing to settle
  ├─ before production, paid, total ↓ → amend; auto refund_pending; refund via original provider
  ├─ before production, paid, total ↑ → amend; balance due; payment link to customer
  └─ production started / dispatched → no amend. Either accept as-is, or cancel
                                       remaining items + charge work-in-progress
```

Cancel stays the escape hatch only for "we don't want it at all".

## Plan

**1. Make the header Refund button honest**
Route `RefundDialog` through the adjustment + provider path: create a `refund_pending` adjustment for the entered amount, then immediately call `payments-refund`. If the outcome is `manual_required` (EFT/cash order, no online charge), fall back to today's ledger-only behaviour and say so in the dialog. Show the provider and outcome in the toast.

**2. Add an admin "Change request" action**
New `adminChangeQuantities` action in `order-engine`, mirroring `customerChangeQuantities` but authorised via staff membership instead of `ordered_by_profile_id`, with a mandatory reason. Same production-status guard, plus an explicit staff override checkbox for `in_production` that records who overrode it.

New `ChangeQuantitiesDialog` on the admin order page (next to Cancel): lists jobs with editable quantity, shows old total → new total → delta live, and states what happens on save (refund pending / balance due / nothing).

**3. Settle the delta automatically**
- Delta negative on a paid order → existing `refund_pending` flow (already built).
- Delta positive on a paid order → set `payment_status` to `part_paid`, raise a balance-due amount, reissue the proforma for the difference and email the customer a pay link. Reuse the existing checkout/handoff route rather than inventing a new one.
- Delta on an unpaid order → just reissue the proforma.

**4. Paper trail**
Every amendment writes a timeline event ("Quantity changed 100 → 200 by <staff>, reason: …", customer-visible) and a `status_history` row. Invoice documents follow the existing rule: proforma is superseded, tax invoice only issues on payment.

**5. Production safety**
If any job has print-ready or imposed artefacts already generated, the dialog warns that files must be regenerated, and the amendment clears the affected job's production artefacts so nobody prints the old quantity.

## Technical notes

- `syncOrderTotals` already recomputes correctly from jobs + adjustments, so both directions of delta fall out of it.
- Linear price scaling is wrong for pack-priced and rate-card products (a 100→200 flyer change is not 2× on a pack matrix). Step 2 should reprice through the same engine the configurator uses rather than reusing the linear `scale` shortcut in `customerChangeQuantities` — and that shortcut on the customer path should be fixed at the same time, otherwise customers can self-serve their way to a wrong price.
- Refunds remain idempotent per adjustment (`idempotencyKey: refund-<adjustment_id>`), so retries are safe.
