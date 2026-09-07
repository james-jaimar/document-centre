# Account customers: credit limit drives payment options and order handling

## What you asked for

1. Trade customer **with a credit limit** → at checkout they only see "Pay on account". No PayFast, no card, no EFT.
2. Trade customer with **no credit limit (blank or 0)** → they see the normal online / EFT choices, no account option.
3. An on-account order arrives in the order manager already **approved and ready to go**, with a **tax invoice** raised (payable on terms) rather than a pro forma.

## What happens today (verified in the code)

- Checkout lists PayFast/Stripe, then "Pay on account" (only when a credit facility resolves), then EFT — all at once. Account never replaces the others.
- The credit facility resolves from a personal credit account, or from the company's credit limit when it is above zero. So point 2 already behaves correctly on the "no account option" side; only the hiding of the other options is missing.
- Orders placed without an online payment land as **New order / awaiting payment**, and the system raises a **pro forma** invoice and sends the "order received" email.
- The chosen payment method is only written into the order's notes field by the browser after the order exists — the server never sees it, so it cannot act on it.

## The changes

### Checkout
- When a credit facility applies (active, limit above zero) and the order total fits within it, the payment section shows **only** "Pay on account (N day terms)" and it is pre-selected.
- If the order exceeds the available limit, the online and EFT options come back with a short note explaining that this order is over the account limit.
- Prepaid / C.O.D. customers are unaffected — they still see online options only.
- Customers with no limit see exactly what they see today.

### Order creation (server)
- The chosen payment method is sent to the server with the order.
- The server re-resolves the customer's credit facility itself (personal account, else company limit) and rejects an "account" order from anyone without a valid facility or over the limit, so it can't be forced from the browser.
- A valid on-account order is created as:
  - status **Approved** (customer sees "In production"), jobs cascaded to approved-for-production
  - payment status **unpaid**, with the payment terms and due date recorded on the order
- Instead of a pro forma, the server raises the **tax invoice** and attaches it to the order-received email, so the customer gets a proper invoice due on terms.
- Everything else (EFT, card, PayFast, prepaid) keeps its current behaviour.

### Order manager
- On-account orders show an "On account — N day terms" marker alongside the order, and the invoice appears in the order's documents as it does for paid orders.

## Technical notes

- `src/pages/dashboard/Checkout.tsx`: derive `accountOnly = canPayOnAccount && !requiresPrepayment`; hide the provider list and EFT row when true, force `paymentMethod = "account"`, and adjust the submit button label/validation.
- `supabase/functions/order-engine/index.ts` (`createOrderWithJobs`): accept `payment_method` on the payload; resolve credit server-side from `customer_credit_accounts` (branch-scoped, `resolveCredit` equivalent) falling back to `customer_companies.credit_limit`; on a valid `account` method set `admin_status: "approved"`, `customer_status: "in_production"`, cascade job status, write `payment_terms_days`/`payment_due_at` and `metadata.payment_method = "account"` at insert time rather than by a follow-up update; side effects call `triggerInvoice(..., "invoice")` instead of `"proforma"`.
- Reject with 403 `credit_facility_required` when `account` is claimed without a facility or the total exceeds the limit.
- No schema change unless `payment_due_at` is absent on `orders` — checked at build time; if missing, add it in a migration with no new grants required.

## Not included

- No change to trade pricing, and no change to how credit limits are set in the admin.
