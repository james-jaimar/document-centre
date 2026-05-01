
## Goal

Add a subscription management panel to the Platform Tenants page so a platform admin can:
1. See each tenant's current plan and subscription status
2. Select a new plan and trigger Stripe Checkout for a tenant

---

## Changes

### 1. Hook: `useTenantSubscriptions`

New file `src/hooks/useTenantSubscriptions.ts`:
- `useTenantSubscriptions()` — fetches all `tenant_subscriptions` rows (platform admin has RLS access)
- `usePlatformPricingPlans()` — fetches all `platform_pricing_plans` with `stripe_price_id IS NOT NULL`, ordered by `sort_order`

### 2. Component: `TenantSubscriptionDialog`

New file `src/components/platform/TenantSubscriptionDialog.tsx`:
- A dialog that opens when the admin clicks "Subscription" on a tenant card
- Shows current plan slug and status (if a subscription exists) with a badge
- Lists available plans from `platform_pricing_plans` as selectable cards
- "Start Checkout" button that calls `create-checkout` Edge Function via `supabase.functions.invoke("create-checkout", { body: { tenant_id, price_id, success_url, cancel_url } })`
- On success, redirects the admin to the Stripe Checkout URL
- `success_url` points back to `/platform?checkout=success`
- `cancel_url` points back to `/platform?checkout=cancelled`

### 3. Update `PlatformTenants` page

- Import and render the new dialog, triggered by a new "Subscription" button on each tenant card (next to the existing Edit / Manage buttons)
- Show a small plan badge on each tenant card using `tenant_subscriptions` data (e.g. "Starter", "Pro") and status indicator
- Show a toast on page load if `?checkout=success` or `?checkout=cancelled` query param is present

### 4. No database changes needed

All tables and RLS policies already exist from the previous migration.

---

## Technical Notes

- The `create-checkout` Edge Function is already deployed and handles auth, tenant ownership verification, and Stripe session creation
- Plans without a `stripe_price_id` are filtered out (not purchasable via Stripe)
- The webhook already syncs subscription status back to `tenant_subscriptions` and `tenants.plan_slug`
