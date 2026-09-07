# Trade accounts: running balance, payments and statements

## The gap today

A business gets a credit limit, and checkout compares **the single order's total** against that limit. Nothing keeps a running balance, so nothing ever "uses up" the limit and there is no way to record money coming in. The only lever is raising the limit, which defeats the point.

## What we build

A proper account for each business: a running balance, entries that move it, and admin tools to record payments and adjustments.

### The account balance

Every business account gets a ledger of entries. The balance is simply the entries added up.

Entries are created:
- **Automatically** — when an on-account order is placed, a charge for the order total goes on the account.
- **By staff** — payment received, credit note / write-off, or an opening balance.

Available credit = credit limit − balance. That is what checkout now checks, instead of just the order total.

The balance is held **at the business level**: everyone ordering under that business draws from the same limit, exactly as a trade account works. A person with their own personal credit account (already supported in settings) keeps their own separate balance.

### Admin: the Account tab

The business page (Admin → Companies → a business, and the same page under Branch) gets a reworked **Account** tab showing:

- Credit limit, current balance, available credit and overdue amount, as four figures at the top.
- **Record payment** button:
  - *Against specific orders* — a list of that business's unpaid on-account orders with amounts outstanding; tick the ones the payment covers, enter reference and date. Those orders are marked paid.
  - *Lump payment on the account* — enter amount, reference and date; it clears the oldest unpaid orders first and any remainder sits on the account as credit.
- **Add adjustment** button — credit note / write-off (reduces what they owe) or opening balance (sets the balance to a figure carried in from the MIS at the start of a period, recorded as a dated entry rather than deleting history).
- **Statement** — every entry in date order with running balance, filterable by date range, downloadable as PDF and CSV. Each order entry links to the order.
- An ageing strip: current, 30, 60, 90+ days, based on each charge's due date from the account's payment terms.

Only staff with access to that tenant/branch can see or post entries; every entry records who posted it and when, and entries are never edited or deleted — a mistake is corrected with an opposing entry.

### Checkout

- "Pay on account" appears only when the account is active **and the order fits inside the remaining credit**.
- If it doesn't fit, the option is hidden and the normal online / EFT choices show, with a short note ("this order takes you over your available credit"). Ordering is never blocked — as you asked.
- The customer's own account page shows their limit, balance and available credit so they can see it before checkout.

### Order side

- Marking an on-account order paid from the order screen posts a payment entry on the account, so the two never drift apart.
- Cancelling or refunding an on-account order reverses its charge.

## Technical notes

- New table `public.customer_account_ledger`: `tenant_id`, `app_id`, `company_id` (nullable), `customer_profile_id` (nullable, for personal facilities), `branch_id`, `entry_type` (`charge` | `payment` | `credit_note` | `opening_balance`), `amount` numeric (signed: charges positive, payments/credits negative), `currency`, `order_id` nullable FK, `reference`, `note`, `entry_date` date, `due_date` date, `created_by`, `created_at`. GRANTs for `authenticated` + `service_role`, RLS mirroring `customer_credit_accounts` (staff of the tenant/branch write; the customer reads their own company's rows read-only).
- Balance and ageing via a `SECURITY DEFINER` function `resolve_account_balance(company_id, profile_id, branch_id)` returning `{balance, available, overdue, buckets}`; a view for the statement rows.
- `order-engine` `createOrderWithJobs`: after inserting an on-account order, insert the `charge` entry with `due_date = order date + payment_terms_days`; extend the existing server-side credit check to compare against **available** credit rather than the raw limit (it already rejects with `credit_limit_exceeded`).
- Payment posting goes through a new edge function `account-ledger` (actions `record_payment`, `record_adjustment`) so allocation to orders and the `orders.amount_paid` / `payment_status` update happen atomically server-side; it reuses the existing `recordPaymentEvent` path for per-order allocation so invoices and emails behave as they do today.
- Frontend: `src/hooks/useAccountLedger.ts`; `src/components/customers/AccountLedgerPanel.tsx`, `RecordAccountPaymentDialog.tsx`, `AccountAdjustmentDialog.tsx`; the Account tab in `src/components/customers/CompanyDetailView.tsx` (used by both Admin and Branch company pages) and the personal equivalent in `CustomerAccountSettings.tsx`.
- `useCustomerPricingTier` returns `available` alongside `credit`; `Checkout.tsx` swaps `withinCreditLimit` to use it.
- Statement PDF reuses the existing invoice document renderer and branding.

## Not included

- No sync with the MIS system — figures are brought in via the opening-balance entry.
- No automatic dunning emails or account hold; overdue only affects what's shown, not whether they can order.
- No change to trade pricing or to how limits are set.
