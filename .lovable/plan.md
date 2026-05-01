
# Stripe Integration Plan

You've clarified two separate payment layers:

1. **Platform layer** -- Tenants pay YOU a monthly subscription (Starter / Core / Multi-Branch) via Stripe.
2. **Tenant layer** -- Each tenant configures their OWN payment gateway (Stripe, PayFast, etc.) so their customers can pay for print orders online.

These are independent systems. Here's the plan for both.

---

## Layer 1: Platform SaaS Billing (Stripe Subscriptions)

This is where your Stripe account bills tenants monthly for their Document Centre plan.

### Database changes

- **`tenant_subscriptions`** table:
  - `id`, `tenant_id`, `stripe_customer_id`, `stripe_subscription_id`
  - `plan_slug` (starter / core / multi_branch)
  - `status` (trialing / active / past_due / cancelled / paused)
  - `current_period_start`, `current_period_end`
  - `trial_ends_at`, `cancelled_at`
  - `metadata` JSONB
  - RLS: platform admins full access, tenant owner/admin SELECT on own row

- Add `plan_slug` column to `tenants` table (default `'starter'`) for quick feature-gating lookups.

### Stripe product setup (manual, in your Stripe dashboard)

- Create 3 Products: Starter, Core, Multi-Branch
- Each product gets monthly Price objects per region (ZAR, USD, GBP, etc.) matching your `platform_pricing_plans` table
- Record the Stripe Price IDs in `platform_pricing_plans` as a new `stripe_price_id` column

### Edge Functions

1. **`stripe-checkout`** -- Creates a Stripe Checkout Session for a tenant to subscribe or change plan. Accepts `plan_slug` and `region`, looks up the `stripe_price_id`, creates or retrieves the Stripe Customer, and returns the session URL.

2. **`stripe-billing-portal`** -- Creates a Stripe Billing Portal session so tenant owners can manage their subscription (update card, cancel, view invoices).

3. **`stripe-webhook`** -- Handles Stripe webhook events:
   - `checkout.session.completed` -- activate subscription, update `tenant_subscriptions`
   - `customer.subscription.updated` -- plan changes, renewals
   - `customer.subscription.deleted` -- cancellation
   - `invoice.payment_failed` -- set status to `past_due`
   - Verifies webhook signature using `STRIPE_WEBHOOK_SECRET`

### Secrets needed

- `STRIPE_SECRET_KEY` -- your platform Stripe secret key
- `STRIPE_WEBHOOK_SECRET` -- webhook signing secret

### Frontend (Platform + Tenant Admin)

- **Platform `/platform/tenants`** -- Show subscription status badge per tenant (active, trial, past_due, cancelled). Allow platform admins to see billing details.
- **Tenant Admin Settings** -- New "Billing" or "Subscription" tab:
  - Shows current plan, status, renewal date
  - "Change Plan" button -> Stripe Checkout with `mode: 'subscription'`
  - "Manage Billing" button -> Stripe Billing Portal (card updates, invoices, cancel)
- **Marketing `/pricing`** -- CTA buttons trigger Stripe Checkout after auth (or redirect to register first)
- **Feature gating** -- A `useTenantPlan()` hook reads `tenants.plan_slug` to conditionally show/hide features (e.g. multi-branch, branding, imposed output)

---

## Layer 2: Tenant-Level Payment Gateway (for order checkout)

Each tenant configures their own gateway so their customers can pay for print jobs.

### Database changes

- **`tenant_payment_gateways`** table:
  - `id`, `tenant_id`, `app_id`, `provider` (stripe / payfast / eft)
  - `is_active`, `is_live` (test vs live mode)
  - `config` JSONB (non-secret settings like merchant ID)
  - `secret_ids` JSONB (vault secret IDs for API keys)
  - `created_at`, `updated_at`
  - RLS: tenant owner/admin only

### Admin UI (Tenant Settings > Payments tab)

Expand the existing `PaymentsTab.tsx`:
- Keep the current EFT/banking details section
- Add a "Card Payments" section with provider selector (Stripe / PayFast)
- For Stripe: fields for publishable key and secret key (stored in Vault via a helper edge function)
- For PayFast: merchant ID, merchant key, passphrase
- Toggle for test/live mode
- Test connection button

### Checkout integration

- Update `Checkout.tsx` to show available payment methods based on tenant config
- If Stripe is configured: redirect to Stripe Checkout (using the tenant's own keys)
- If PayFast is configured: redirect to PayFast payment page
- If EFT only: show banking details (current behaviour)
- On payment completion, call `recordPaymentEvent` via the order-engine

### Edge Functions

- **`tenant-payment-session`** -- Creates a payment session using the tenant's own gateway credentials (retrieved from Vault). Returns a redirect URL. This keeps tenant API keys server-side only.
- **`tenant-payment-webhook`** -- Receives payment confirmations from Stripe/PayFast, verifies signatures, calls `recordPaymentEvent`.

---

## Implementation order

1. **Layer 1 first** (platform billing) -- this is the revenue foundation
2. **Layer 2 second** (tenant gateways) -- can be phased in once the subscription system is stable

### Technical notes

- All Stripe calls happen in Edge Functions (server-side only, keys never reach the browser)
- Webhook endpoints use signature verification, not JWT auth
- Tenant gateway secrets are stored in Supabase Vault (via `create_secret` / `read_secret` DB functions you already have)
- The existing `payments` table continues to track order-level payments; `tenant_subscriptions` is a new, separate concern

---

Shall I proceed with Layer 1 (platform SaaS billing) first?
