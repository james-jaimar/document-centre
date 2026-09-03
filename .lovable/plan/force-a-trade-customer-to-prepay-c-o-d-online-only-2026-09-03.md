# Force a trade customer to prepay (C.O.D. / online only)

## What you want
A customer can be trade (trade pricing, MIS account) but still be blocked from
"Pay on account" and EFT at checkout — they must pay online (PayFast) before the
order is accepted.

## Current behaviour (verified)
- Checkout shows three payment groups: online providers (PayFast/Stripe),
  "Pay on account" (only when a credit facility resolves), and "EFT — pay by
  bank transfer" (always shown to everyone).
- `useCustomerPricingTier` resolves credit from a personal
  `customer_credit_accounts` row, or falls back to the company's `credit_limit`
  when it is greater than zero.
- There is no column anywhere on `customer_companies`, `tenant_memberships` or
  `customer_credit_accounts` that expresses "prepayment required" — so today the
  only way to stop account payment is to zero the credit limit, and that still
  leaves EFT available.

## Proposed change
Add an explicit **Payment terms** control, settable per company and per
individual customer:

- `Account` (default today's behaviour) — credit/EFT allowed if a facility exists
- `Prepaid / C.O.D.` — online payment only

When a customer resolves to Prepaid:
1. "Pay on account" is hidden at checkout (even if a credit limit exists).
2. The EFT / bank transfer option is hidden.
3. Only enabled online providers remain; PayFast is auto-selected if it is the
   only one.
4. If no online provider is configured for the branch, checkout shows a clear
   "online payment unavailable — contact the store" message rather than falling
   back to EFT.
5. Server side, `order-engine` rejects `payment_method` of `account` or
   `offline` for a prepaid customer, so it cannot be bypassed from the client.

Individual setting wins over the company setting when it is explicitly set;
otherwise the customer inherits the company's terms (same pattern as trade
status).

## Where you set it
- Customers → Companies → edit dialog: "Payment terms" selector next to credit
  limit / terms days.
- Customers → individual customer account settings: same selector with an
  "Inherit from company" default.
- The customer list shows a small "Prepaid" badge so staff can see it at a glance.

## Technical notes
- Migration: `payment_terms_mode` on `public.customer_companies` (`account` |
  `prepaid`, default `account`) and a nullable `payment_terms_mode` on
  `public.tenant_memberships` (null = inherit). No new tables, so no new grants.
- `useCustomerPricingTier` returns `requiresPrepayment`; `Checkout.tsx` uses it to
  filter the payment radio group and adjust default selection/validation.
- `supabase/functions/order-engine` re-resolves the flag from the DB before
  accepting a submit and returns 400 on a disallowed method.
- `CompanyFormDialog.tsx`, `CompanyDetailView.tsx` and
  `CustomerAccountSettings.tsx` get the new selector.

## Not included
No change to pricing tiers — a prepaid customer still gets trade prices.
