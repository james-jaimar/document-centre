# Live Stripe Cutover

Swap the platform Stripe credentials from test to live so Jaimar can bill tenants for real.

## Steps

1. **Update secrets** — trigger `secrets--update_secret` for:
   - `STRIPE_SECRET_KEY` (live `sk_live_...`)
   - `STRIPE_WEBHOOK_SECRET` (live `whsec_...` from the live-mode webhook endpoint)

   You'll paste the values into the secure form — I never see them.

2. **Verify** — once saved, confirm `create-checkout` and the subscription webhook are using the live keys (no code change needed; they read from env at runtime).

## Pre-flight checklist (do these in Stripe Dashboard before/after)

- Toggle dashboard to **Live mode**
- Business settings → Public details:
  - Legal name: `Jaimar Developments Ltd`
  - Public/Statement name: `Document Centre`
  - Support email: `hello@document-centre.com`
  - Registered address: 12 Burghley Park Close, Lincoln, LN6 9XY, UK
  - Upload Document Centre logo
- Create the **live** webhook endpoint pointing at the same URL as test, subscribed to the same events — copy its signing secret for `STRIPE_WEBHOOK_SECRET`
- Recreate (or copy via Stripe CLI) your **Products & Prices in live mode** and update `platform_pricing_plans.stripe_price_id` values — live prices have different IDs than test
- Confirm payout bank account is verified

## Not in scope

- Tenant-level Stripe Connect keys (`tenant_payment_gateways`) — those are per-tenant and handled separately
- PayFast credentials — untouched

After you confirm, I'll fire the secret-update prompts.
