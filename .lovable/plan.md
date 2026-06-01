# Go-live: Stripe subscriptions

Scope is platform subscription billing only. Customer order payments stay on PayFast (configured per branch in `tenant_payment_gateways`) — no Stripe order webhook needed.

## Steps

1. **Update runtime secrets** (single secrets form):
   - `STRIPE_SECRET_KEY` → live `sk_live_...` from Stripe Dashboard (Live mode → Developers → API keys)
   - `STRIPE_WEBHOOK_SECRET` → `whsec_pr2knAxhyJd0jsybLRtdX9wSQLZqVDl9` (the live endpoint you just created for `/functions/v1/stripe-webhook`)

2. **Swap subscription price IDs to live**
   - Live-mode Stripe Products/Prices have different IDs than test.
   - Update `platform_pricing_plans.stripe_price_id` for every active plan via a migration (you'll paste the live `price_...` values, one per plan).

3. **Smoke test**
   - From `/platform`, assign a paid plan to a test tenant using a real card (or Stripe's live test card if you have one enabled).
   - Confirm `stripe-webhook` logs show `checkout.session.completed` + `customer.subscription.created` arriving with valid signatures.
   - Confirm `tenant_subscriptions` row is created/updated.

## Not in scope
- `stripe-order-webhook` and any `STRIPE_*` order-side wiring — leave as-is (test keys / unused). Can be removed later if you want; not blocking go-live.
- Tenant-level `tenant_payment_gateways` (PayFast) — unchanged.

## Technical notes
- No code changes required for step 1; both `stripe-webhook` and `create-checkout` read keys from env at runtime.
- Step 2 needs the live `price_...` IDs from you before I write the migration.
