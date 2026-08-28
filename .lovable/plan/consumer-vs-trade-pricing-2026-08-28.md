# Consumer vs trade pricing

Two price levels on pack-priced products. Everyone sees consumer pricing by default; only customers an admin has marked as **trade** see trade pricing. Trade customers can also carry an account number and a credit limit, and check out on account.

## 1. Customer record: trade flag + account number

On the customer's record for the tenant (`tenant_memberships`), add:
- `is_trade_customer` (default off) — set by staff only, never self-service.
- `mis_account_number` — free text, matches the account number in the MIS system.

Surfaced in the admin Customer detail → **Account** tab, next to the existing credit accounts panel, plus a "Trade" badge and an Account no. column on the Customers list (and branch customers list) so staff can spot them.

Credit limits stay where they already are: `customer_credit_accounts`, per branch with an "all branches" default (limit, terms, discount %, notes). No change to that model.

## 2. Trade price on each pack row

Pack ladder rows already store `price_minor`. Add an optional `trade_price_minor` to the same row.

- Master pack pricing editor, tenant/branch override editors and the variant matrix each get a second price column ("Trade"), shown beside the consumer price.
- Blank trade price = fall back to the consumer price for that row (so nothing breaks on existing products).
- Bulk helpers on the trade column: fill from consumer minus a percentage, and copy the trade ladder between pricing options.

## 3. Which price the customer sees

A single resolver decides the tier:
- Not signed in → consumer.
- Signed in, membership not marked trade → consumer.
- Signed in and marked trade → trade.

Everywhere a pack price is read — storefront product page, quantity dropdowns, uploaded-artwork builder, templated-artwork builder, cart lines — the price for the active tier is used. Add-ons (percent / fixed / per-unit) are unchanged and apply on top of whichever base price was used.

The customer never sees both prices; the trade customer just sees their own price. The tier used is stamped onto the cart/order line so an invoice raised later reprices identically, and admin order views show a small "Trade" marker.

Staff-side quoting (spec quote builder, admin order editing) gets a tier selector defaulting to the selected customer's tier.

## 4. Pay on account at checkout

At checkout, add a **Pay on account** option, only visible when:
- the signed-in customer has an active credit account for the active branch (or the default one), and
- order total + current outstanding on-account balance is within the credit limit.

When over the limit the option is shown disabled with the reason ("exceeds available credit"). Choosing it places the order without an online payment, marks it as on-account, sets a due date from the payment terms, and issues the invoice as it does for EFT orders. Outstanding balance = total of on-account orders that are not yet settled.

## Technical notes

- Migration: `ALTER TABLE public.tenant_memberships ADD COLUMN is_trade_customer boolean NOT NULL DEFAULT false, ADD COLUMN mis_account_number text;` — no new table, existing grants/RLS cover it. Staff-only write is already enforced by the membership policies.
- `QuantityBlock` type gains `trade_price_minor?: number` (jsonb — no migration).
- New helper in `src/lib/pricing/packOptions.ts`: `rowPrice(block, tier)` plus a `tier` argument threaded through `packQuantitiesForOption`, `snapQuantity` callers and `computePackPrice`.
- New hook `useCustomerPricingTier()` reading the current profile's membership; returns `"consumer" | "trade"` and the resolved credit account.
- Order/cart line metadata gains `pricing_tier`.
- Checkout: extend the existing payment-method radio group in `src/pages/dashboard/Checkout.tsx` with `on_account`, reusing the EFT/pro-forma path for invoice generation.
