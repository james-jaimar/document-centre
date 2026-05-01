## Step 1: Add Stripe Secrets

I'll prompt you to securely input two secrets:

1. **STRIPE_SECRET_KEY** — your Stripe API secret key (starts with `sk_test_` or `sk_live_`)
2. **STRIPE_WEBHOOK_SECRET** — the webhook signing secret from Stripe (starts with `whsec_`)

These will be stored as Supabase Edge Function secrets, accessible via `Deno.env.get()`.

## Step 2: Build the `stripe-webhook` Edge Function

Create `supabase/functions/stripe-webhook/index.ts` that:

- Verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET` (raw body + `Stripe-Signature` header)
- Handles these events:
  - `checkout.session.completed` — creates/updates `tenant_subscriptions` row
  - `customer.subscription.created` / `updated` — syncs plan, status, period dates
  - `customer.subscription.deleted` — marks subscription cancelled, downgrades `tenants.plan_slug`
  - `invoice.payment_succeeded` — updates status to `active`
  - `invoice.payment_failed` — updates status to `past_due`
- Uses `SUPABASE_SERVICE_ROLE_KEY` internally for writes (bypasses RLS)
- Returns 200 to Stripe on success, 400 on signature failure

## Step 3: Build the `create-checkout` Edge Function

Create `supabase/functions/create-checkout/index.ts` that:

- Authenticates the caller (tenant owner/admin only)
- Looks up or creates a Stripe Customer for the tenant
- Creates a Stripe Checkout Session for the selected `platform_pricing_plans.stripe_price_id`
- Returns the checkout URL to the frontend

## Step 4: Platform Subscription UI

- Add a **Subscription** section to the Platform Tenants view or a dedicated billing page
- Wire up plan selection buttons that call `create-checkout`
- Show current plan status, period, and cancel option

## Step 5: Register in `config.toml`

Add `stripe-webhook` with `verify_jwt = false` (Stripe calls it directly). Add `create-checkout` with default JWT verification.

---

### Technical Details

- Stripe SDK: Use `stripe` npm package via esm.sh in Deno (`import Stripe from "https://esm.sh/stripe@14"`)
- Signature verification uses Stripe's `constructEventAsync` with the raw request body
- All subscription state changes flow through the webhook — the checkout function only creates sessions
