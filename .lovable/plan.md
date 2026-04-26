## Goal

Eliminate every remaining ZAR-locked currency render so prices honour the order's stored currency (or the active region's currency) everywhere — admin, branch, customer dashboard, order detail tabs, and dialogs.

## What's already correct (no change)

- `src/lib/formatCurrency.ts` — `formatPrice` / `formatPriceDelta` (canonical helper, locale picked per ISO code).
- Order Builder, Cart, Checkout, OrderConfirmation, OptionSelector, PriceSummary, AdminPricing, BranchPricing, PhotoPrintsBuilder — already migrated last turn.

## The leak: ZAR-locked `Intl.NumberFormat("en-ZA", …)` helpers

Each of these calls hard-codes the **locale** to `en-ZA`, which forces "R" symbol placement and `1 234,56` separators even when the currency arg is GBP/USD/EUR/AUD. They also default the currency arg to `"ZAR"` when the order field is missing, so historical / partially-migrated orders render as rand. Fix: replace every local `fmt`/`ZAR.format`/`formatCurrency` helper with the shared `formatPrice` from `@/lib/formatCurrency`, and always pass `order.currency` (or `region.currency_code`) — never default silently to ZAR mid-render.

### Files to migrate

1. **`src/components/orders/detail/OrderPricingTab.tsx`**
   - Drop the local `fmt`; import `formatPrice`. Pass `order.currency` from the parent (already in scope via the order detail page).
2. **`src/components/orders/detail/JobDetailPanel.tsx`**
   - Same pattern. Currency comes from the parent order; thread it through the panel props (one new optional `currency` prop, default falls back to `formatPrice` default which is ZAR — but caller will always supply it).
3. **`src/pages/dashboard/CustomerOrderDetail.tsx`** (line 82)
   - Replace local `fmt` with `formatPrice`; use `order.currency` from the loaded record.
4. **`src/pages/dashboard/CustomerOrders.tsx`** (line 234)
   - Replace `R {total.toFixed(2)}` with `formatPrice(total, order.currency)`. The list query already selects `currency`.
5. **`src/pages/admin/AdminOrders.tsx`** (lines 100–106)
   - Replace local `formatCurrency` with `formatPrice` (call sites unchanged structurally).
6. **`src/pages/admin/AdminCustomers.tsx`** (line 17, 115)
   - Customer lifetime spend is aggregated across orders in possibly mixed currencies. Plan: keep a single `formatPrice(amount, primary_currency)` where `primary_currency` is the customer's most-used currency (already a column on customers? if not, fall back to tenant `default_currency`). Simplest correct call: `formatPrice(c.total_spent, c.preferred_currency ?? tenantDefaultCurrency ?? "ZAR")`. I'll inspect what columns are available and pick the cleanest option during implementation; if neither is present we'll fall back to the tenant default currency from `TenantContext`.
7. **`src/pages/admin/AdminCustomerDetail.tsx`** (lines 40, 274, 282, 322)
   - Same approach as AdminCustomers. For the per-order row at line 322, use the order's own `currency` (always available on the row).
8. **`src/components/admin/MembersTable.tsx`** (line 42)
   - Member-level credit limit: use tenant `default_currency` from `TenantContext` instead of hard-coded ZAR.
9. **`src/pages/admin/AdminOrderDetail.tsx`** (line 71) and **`src/pages/branch/BranchOrderDetail.tsx`** (line 95)
   - The `window.confirm` string concatenates `${order.currency} ${Number(order.amount_due).toFixed(2)}`. Replace with `formatPrice(Number(order.amount_due), order.currency)`.
10. **`src/pages/admin/AdminDocuments.tsx`** (line 193) and **`src/pages/branch/BranchOrders.tsx`** (line 72)
    - Replace `${inv.currency} {Number(inv.total_amount).toFixed(2)}` style with `formatPrice(Number(...), inv.currency || row.currency)`.
11. **`src/components/orders/RefundDialog.tsx`** (line 56), **`src/components/orders/RecordPaymentDialog.tsx`** (lines 42, 108), **`src/components/orders/CancelOrderDialog.tsx`** (line 74)
    - All already receive a `currency` prop; switch the manual `${currency} ${n.toFixed(2)}` strings to `formatPrice(n, currency)`. Leave the `useState<string>(amountDue.toFixed(2))` initialiser alone — it seeds a numeric input field, not a display string.

### Customer Account Settings copy

12. **`src/components/admin/CustomerAccountSettings.tsx`** (line 54) — label `"Credit limit (ZAR)"` becomes `Credit limit ({tenantDefaultCurrency})` so it's accurate for non-ZA tenants.

### Tenant default currency wiring

For files 6, 7, 8, 12 we need the tenant's `default_currency`. `TenantContext` exposes the tenant record; I'll read `tenant.default_currency` (already shown in `GeneralTab.tsx` — same field). If `TenantContext` doesn't currently expose it, I'll add it to the provider's selected columns rather than re-fetch.

## What stays in ZA-locked locale on purpose

- `src/pages/platform/PlatformDemoPrintPricing.tsx` — admin tooling that explicitly references "ZAR (Source)". Leave as is; this *is* ZAR by design.
- `src/pages/platform/PlatformPricingRegions.tsx` — region config UI; the literal "ZAR" is editable data, not a currency render.
- `src/pages/admin/settings/GeneralTab.tsx` — currency *picker* listing ISO codes. Correct as is.
- `src/integrations/supabase/types.ts` — generated.
- `toFixed(2)` for non-currency things (`zoom`, file size in KB/MB, CPU load, S3 GB) — not currency.

## Out of scope

- Marketing `/pricing` page (`src/pages/Pricing.tsx`) — already region-aware via `useRegionalPricing` and `formatPlanPrice`; the `toFixed` there is inside its own region-aware formatter. No change needed.
- Server-side rendering of currency (Edge Functions, emails) — not in this sweep. Flag for a follow-up if you want emails localised too.

## QA checklist after implementation

1. Switch region to GBP via the storefront switcher.
2. Place a small order; confirm the "Order Placed" total renders `£…` (already correct), then click "View Order Details" — pricing tab and job panel should render `£…`, not `R …`.
3. Visit My Orders — list row should render `£…`.
4. As admin, view the same order in `/admin/orders/[id]` — currency should match the order's stored currency, not the tenant default.
5. As admin, view the customer profile — lifetime spend uses tenant default currency (or preferred), per-order rows use the order's own currency.
6. Repeat steps 1–5 for USD and EUR to confirm decimal/thousands separators (`$1,234.56`, `€1.234,56`).

## Risk

Low. All changes are render-layer swaps to an existing helper; no schema or query changes. Dialogs already receive `currency` props, and order rows already select `currency` in the queries (`src/lib/orders/queries.ts` lines 21 & 71 confirmed).
