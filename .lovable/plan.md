# Branch Discounts & Vouchers

Branch owners get a single "Discounts" area to run three kinds of promotions on their own storefront. Nothing tenant- or platform-wide yet — every discount belongs to one branch and only applies to orders at that branch.

## What branches can create

1. **Coupon codes** — customer types a code at checkout (e.g. `SAVE15`).
2. **Customer vouchers** — a code issued to a named customer/email; single-use credit tied to that person.
3. **Automatic specials** — no code needed, auto-applies when the rules match (e.g. "20% off flyers this week").

## Discount value types (all three kinds support these)

- **Percentage off** subtotal or matching items (e.g. 15%).
- **Fixed amount off** (e.g. R50).
- **Free delivery** — zeroes the delivery/collection fee.
- **Free item / freebie** — free finishing (lamination, binding upgrade) or a free product line the branch nominates.

## Rules & limits per discount

- Start date + expiry date.
- Total redemption cap, and per-customer redemption cap.
- Minimum order value (e.g. only valid over R200).
- Product / product-family restriction (e.g. only flyers, only bound documents).
- First-time customers only (no prior paid orders at this branch).
- Active/inactive toggle for pausing without deleting.
- Stacking: only one code-based discount per order; automatic specials can stack with a code only if the branch ticks "Allow combining with codes" on the special.

## Where it appears

**Branch admin → new "Discounts" page**
- List of all discounts (code, type, value, uses, status, expiry).
- Create/edit dialog with tabs: *Value* · *Rules* · *Products* · *Customers*.
- Per-row: pause, duplicate, view redemptions.
- "Issue voucher" flow: pick a customer (or paste email), generate a unique code, optionally email it.

**Customer checkout**
- New "Promo code" field above the totals. Apply → server validates and returns the discount line.
- Applied automatic specials show as their own line ("Weekend flyer special −R80") — no code entry needed.
- Clear error copy for invalid/expired/min-order/first-time-only cases.

**Order detail (branch + customer)**
- Discount line item shows on invoice, order summary, PDF invoice, and refund calculations.
- Reorder flow re-evaluates discounts against current rules (doesn't blindly carry old code).

**Onboarding checklist**
- Add an optional "Set up your first promo (optional)" step so new branches see the feature exists.

## Onboarding checklist entry

The existing `BranchOnboardingChecklist` gains one optional item pointing at the new Discounts page. Marked complete once the branch has ever created a discount (active or not).

---

## Technical section

### Database (single migration)

New tables, all `branch_id NOT NULL`, tenant-scoped through the branch:

- `branch_discounts`
  - `id`, `branch_id`, `tenant_id`
  - `kind`: `coupon` | `voucher` | `automatic`
  - `code` (nullable for automatic; unique per branch when set, case-insensitive)
  - `name`, `description`
  - `value_type`: `percentage` | `fixed` | `free_delivery` | `free_item`
  - `value_amount` (numeric; percent 0-100 or currency), `currency_code`
  - `free_item_ref` jsonb (family_id / finishing_id for freebies)
  - `starts_at`, `ends_at`
  - `max_redemptions` int null, `max_per_customer` int null
  - `min_order_subtotal` numeric null
  - `first_time_customer_only` bool
  - `allow_combine_with_code` bool (automatic only)
  - `is_active` bool
  - `created_by`, timestamps

- `branch_discount_products` (M:N restriction to product families; empty = all)
  - `discount_id`, `product_family_id`

- `branch_discount_customers` (voucher assignment)
  - `discount_id`, `customer_user_id` nullable, `customer_email` nullable

- `branch_discount_redemptions` (audit trail, used for caps)
  - `discount_id`, `order_id`, `customer_user_id` nullable, `customer_email` nullable, `amount_applied`, `redeemed_at`

- `orders`: add `discount_code text null`, `discount_total numeric default 0`, `discount_snapshot jsonb null` (immutable at order-time).

**RLS**: branch managers of the owning branch can CRUD their own discounts; store operators read-only. Customers get no direct access — validation happens through the edge function. `service_role` for edge functions. All tables get explicit `GRANT`s alongside CREATE.

### Edge functions

- `discount-validate` — inputs: `order_id` (or draft cart) + optional code. Runs all rule checks server-side, returns line-item breakdown or a typed error (`expired`, `min_order`, `first_time_only`, `product_restricted`, `cap_reached`, `not_your_voucher`, etc.). Called from Checkout and from the customer "apply code" action.
- `discount-apply` — atomically writes `discount_code`, `discount_total`, `discount_snapshot` on the order, inserts `branch_discount_redemptions` row, and recomputes totals via existing `syncOrderTotals`.
- `discount-remove` — clears the fields and deletes the redemption row (only while order is still editable / unpaid).
- Order confirmation / payment success path calls `discount-apply` server-side; **automatic specials** are evaluated during `syncOrderTotals` so they can't be bypassed by tampering.

### Frontend

- New `src/pages/branch/BranchDiscounts.tsx` + list/detail components under `src/components/branch/discounts/`.
- Hook `useBranchDiscounts` (list/create/update/delete, react-query).
- Checkout: promo code field wired to `discount-validate` → `discount-apply`, shows applied line, allows remove.
- Order summary/invoice PDF: render `Discount` line above VAT, using `discount_snapshot` so historical orders never change.
- Reorder review: recompute against current rules; if the old code no longer applies, show a soft warning.
- Refund flow (`payments-refund`): refund amount is post-discount total, unchanged logic.

### Ringfencing

Every query and RLS policy scopes by `branch_id`. Codes are unique per branch, so `SAVE10` at Sandton and `SAVE10` at Rosebank are independent.

### Out of scope (for now)

- Tenant-wide or platform-wide promo codes (Stripe-linked subscription coupons already exist separately and are untouched).
- Gift cards / prepaid balances.
- BOGO / "buy X get Y" combinatorial rules — only single-item freebies in v1.
- Referral codes.
