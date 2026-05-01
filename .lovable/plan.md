
## Problem

There are two gaps:
1. **Tenant owners** have no way to see their subscription status or trigger checkout from within their own admin portal (`/admin/settings`).
2. The **Platform Admin** subscription dialog exists on `PlatformTenants.tsx` but may not be obvious to find.

The screenshot confirms the user is on the Tenant Settings page (Workflow tab visible). There is no Billing/Subscription tab.

## Plan

### 1. New "Billing" tab on Tenant Settings

Add a `BillingTab` component at `src/pages/admin/settings/BillingTab.tsx` and wire it into `AdminSettings.tsx` as a new tab (with `CreditCard` icon).

The tab will show:
- **Current plan** badge and status (active, trialing, past_due, etc.)
- **Current period end** date
- **Available plans** from `platform_pricing_plans` (ones with `stripe_price_id`)
- A **"Change Plan"** / **"Subscribe"** button that invokes the `create-checkout` Edge Function and redirects to Stripe Checkout
- Success/cancel toast handling via URL params on return

This reuses `useTenantSubscriptions` and `usePlatformPricingPlans` hooks. The tab is only visible to `owner` and `admin` membership roles.

### 2. Update `AdminSettings.tsx`

- Import `BillingTab` and `CreditCard` icon
- Add `{ value: "billing", label: "Billing", icon: CreditCard }` to the tabs array
- Add `<TabsContent value="billing"><BillingTab /></TabsContent>`

### Technical details

- `BillingTab` fetches the current tenant's subscription via `useTenantSubscriptions()` filtered by `tenantId` from `useTenantContext()`
- Checkout calls `create-checkout` with `success_url` and `cancel_url` pointing back to `/admin/settings?tab=billing&checkout=success|cancelled`
- The tab reads `useSearchParams` to show toasts on return from Stripe
- Plan cards show name, price, and current/selected state (similar to the existing `TenantSubscriptionDialog` layout but inline)
