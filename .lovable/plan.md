
## Problem

On **Tenant Settings → Billing → Tenant Subscription Plan**, the "Refresh from Stripe" button only re-verifies the single `stripe_price_id` already stored on the currently-selected `platform_pricing_plans` row. There is no way to see what products/prices actually exist in the Stripe catalogue and pick one — the link between a tenant plan and a Stripe price is effectively hard-coded at seed time.

## Goal

Let a platform admin, from the Tenant Subscription Plan card:

1. Pull the **live list** of Stripe products + prices from the connected account.
2. Choose any active price and attach it to the selected `platform_pricing_plans` row (updating `stripe_price_id`, unit amount, currency, and product name/label).
3. Keep the existing "verify current" behaviour as a fallback.

## Changes

### 1. New edge function `stripe-list-catalog` (read-only)
- Auth: same rules as `stripe-verify-price` (platform admin or active tenant admin).
- Calls Stripe REST `GET /v1/products?active=true&limit=100&expand[]=data.default_price` and (optionally) `GET /v1/prices?active=true&limit=100&expand[]=data.product` to also surface non-default prices.
- Returns a flat list: `[{ product_id, product_name, price_id, currency, unit_amount, unit_amount_decimal, recurring: {interval, interval_count} | null, active }]`.
- Optional query filter: `currency` (to pre-filter by the tenant's region currency).

### 2. `TenantPlanAssignmentCard.tsx`
- Add a **"Browse Stripe catalogue"** button next to the existing "Refresh from Stripe" button.
- Opens a dialog that:
  - Calls `stripe-list-catalog` (filtered by the selected region's currency when present).
  - Shows a searchable table of Product · Price · Interval · Currency · Status.
  - "Attach to this plan" action on each row updates the currently selected `platform_pricing_plans` record with:
    - `stripe_price_id = <chosen price id>`
    - `price = unit_amount / 100`
    - `currency_code = currency` (if the column exists)
    - Optionally refresh `plan_name` from Stripe product name (with a checkbox "also update plan label").
  - Invalidates `platform_pricing_plans` / `branch_plans` queries and toasts a success message.
- Keep the existing "Refresh from Stripe" button as-is for one-off verification of the already-linked price.
- Show the currently attached `stripe_price_id` (masked, last 8 chars) under the Branch plan selector so it's obvious what's linked.

### 3. No DB schema change
All writes go through the existing `platform_pricing_plans` update path already used by `refreshFromStripe`.

## Out of scope
- Creating new plans from Stripe products (still a manual seed step in `PlatformMasterPricing`).
- Editing coupons/promotion codes from the browse dialog (still linked in the Stripe dashboard).
- Non-recurring / one-off Stripe prices — filtered out in the list.

## Files touched
- `supabase/functions/stripe-list-catalog/index.ts` (new)
- `supabase/config.toml` (register the new function with `verify_jwt = true`)
- `src/components/admin/billing/TenantPlanAssignmentCard.tsx` (browse dialog + attach action)
- `src/components/admin/billing/StripeCatalogueDialog.tsx` (new; dialog UI)
