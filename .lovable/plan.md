
# Subscription Management Overhaul

## Root Cause

Every `platform_pricing_plans` row has `stripe_price_id = NULL`. The `usePlatformPricingPlans` hook filters `.not("stripe_price_id", "is", null)`, so both the platform dialog and the tenant billing tab return zero plans. Additionally, the Platform Pricing Regions page has no UI to enter Stripe price IDs, so there is no way to wire them up.

## Changes

### 1. Add `stripe_price_id` column to the Pricing Regions admin

In `PlatformPricingRegions.tsx`, add a `stripe_price_id` input field per plan row in the Plan Prices matrix table. When saving, persist `stripe_price_id` alongside the price. This lets the platform admin paste Stripe price IDs directly from the Stripe dashboard against each plan/region combination.

### 2. Replace the Platform Subscription Dialog with a full management page

Replace the small `TenantSubscriptionDialog` modal with a proper full-page `PlatformSubscriptions.tsx` (or expand inline on `PlatformTenants.tsx`). This page will provide:

- **Subscription overview table** showing all tenants with their current plan, status, Stripe customer ID, period dates, and subscription ID.
- **Actions per tenant**: Assign/change plan (trigger checkout), mark as manually active (for offline payments), cancel subscription (sets status to cancelled and downgrades to starter).
- **Plan assignment without Stripe**: Allow platform admins to directly update a tenant's `plan_slug` on the `tenants` table for manual overrides (e.g. free tier, partner deals).
- Add a sidebar nav item for this page under Platform Admin.

### 3. Fix the Tenant Billing Tab

Update `BillingTab.tsx`:

- Show all plans from `platform_pricing_plans` (not just those with `stripe_price_id`). Plans without a Stripe price ID display as "Contact admin to subscribe" instead of a checkout button.
- Filter plans to the tenant's detected region (based on the tenant's pricing region or the default region) so they see prices in their currency.
- When `stripe_price_id` is present, the checkout button works as-is.
- Show plan features/descriptions if available (future column, for now show plan name and price).
- Display subscription history: status timeline showing when subscription started, renewed, or was cancelled.

### 4. Hook improvements

Update `usePlatformPricingPlans`:
- Accept an optional `regionId` parameter to filter by region.
- Add a second variant `useAllPlatformPricingPlans` that does NOT filter out null `stripe_price_id` rows (for the tenant billing display).
- Keep the existing filtered version for checkout flows where a Stripe price ID is required.

### 5. Save flow for Pricing Regions

Update the `saveAll` function in `PlatformPricingRegions.tsx` to also persist `stripe_price_id` when updating plan rows.

---

### Technical Details

**Files created:**
- `src/pages/platform/PlatformSubscriptions.tsx` -- full subscription management page

**Files modified:**
- `src/pages/platform/PlatformPricingRegions.tsx` -- add `stripe_price_id` input per plan cell, persist on save
- `src/hooks/useTenantSubscriptions.ts` -- add `useAllPlatformPricingPlans` hook, add `regionId` filter option
- `src/pages/admin/settings/BillingTab.tsx` -- show all plans (region-filtered), handle missing Stripe IDs gracefully
- `src/components/platform/TenantSubscriptionDialog.tsx` -- may be removed or kept as a quick-action; main management moves to the new page
- `src/App.tsx` -- add route for `/platform/subscriptions`
- Sidebar/nav component for platform -- add "Subscriptions" link

**Database:** No schema changes needed. `stripe_price_id` column already exists on `platform_pricing_plans`.
