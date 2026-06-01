## 1. Stripe plan update (ZA / PostNet)

- Update `platform_pricing_plans` row (region ZA, plan_slug `postnet`):
  - `price` → `499.00`
  - `stripe_price_id` → `price_1TcUWOLiJIHImIL1hqE4Yiik`
- Confirm/rotate `STRIPE_SECRET_KEY` secret to the **live** key (you supply it via the secret prompt — I'll trigger the update flow).
- Keep `assign-branch-plan` / `create-branch-checkout` unchanged — they already read `stripe_price_id` from this row.

## 2. Trial model — "starts on first login"

New columns on `branch_subscriptions`:
- `trial_started_at timestamptz` — set the first time a branch admin logs into that branch's admin portal.
- `trial_status text` — `not_started | active | expired | converted`.
- Keep existing `trial_ends_at` (computed = `trial_started_at + 14 days`).

Logic:
- When PostNet tenant admin assigns the `postnet` plan to a branch → row created with `trial_status='not_started'`, `trial_days=14`.
- On first authenticated load of `/admin` (via `BranchLayout`), an edge function `start-branch-trial` stamps `trial_started_at = now()` if null and sets `trial_status='active'`.
- Trigger `send-email` with a "Your 14-day trial has started" template (branch admin email + link to their storefront + onboarding checklist).
- Daily cron (`expire-branch-trials`) flips to `expired` after 14 days and sets `billing_status='pending_payment'` so existing `useBranchSubscriptionGate` soft-blocks them until they Pay Now in `BranchSubscriptionPanel`.

## 3. Soft onboarding wizard (dismissible banner + checklist)

New table `branch_onboarding_progress`:
- `branch_id` (PK), `company_details_done`, `email_settings_done`, `payfast_done`, `branding_done`, `team_invited`, `first_test_order_done`, `dismissed_at`, `completed_at`.

New component `<BranchOnboardingChecklist />` shown at the top of `BranchDashboard`:
- Persistent card listing 6 steps with progress bar; "Hide for now" sets `dismissed_at` (re-appears after 7 days or until 100%).
- Each step links to the relevant tab in `BranchSettings`:
  1. **Confirm company details** → BranchSettings → General (auto-check when name/address/VAT saved)
  2. **Set sender email** → BranchSettings → Email (SMTP from/host/user; reuses existing `tenant_settings.integrations.smtp` cascading store at branch scope)
  3. **Branding** → upload logo/colours
  4. **PayFast (guided)** → see §4
  5. **Invite team** → BranchSettings → Users
  6. **Run a test order** → marks done when first non-test order is placed

Auto-detection: each step's "done" flag is computed by a `recompute_branch_onboarding(branch_id)` SQL function called on relevant writes (no manual ticking needed).

## 4. PayFast — guided setup (no integration this round)

New `BranchSettings → Payments` panel:
- Step-by-step accordion mirroring [PayFast Quick Start](https://developers.payfast.co.za/docs#quickstart) — Register → Get Merchant ID & Key → Get Passphrase → enter here.
- Fields stored in existing `payment_gateways` table scoped to the branch: `merchant_id`, `merchant_key`, `passphrase`, `mode` (sandbox/live), `enabled`.
- "Test connection" button calls existing PayFast sandbox ping (or a no-op stub flagged TODO if not present).
- Banner: "Until PayFast is set up, your customers will only see Cash / EFT at checkout."
- No edge functions, no ITN webhook — that's a separate future build.

## 5. Email on first login

New template in `send-email`: `branch_trial_started.html`:
- Subject: "Welcome to Document Centre — your 14-day trial is live"
- Body: branch storefront link (`https://posnetprintcentre.com/t/postnet/...`), admin login link, onboarding checklist link, support email.

## Technical notes

- DB migration order: alter `branch_subscriptions`, create `branch_onboarding_progress` + GRANTs + RLS (tenant_admin + own branch_manager only), `recompute_branch_onboarding` SQL function, daily cron via `pg_cron` for trial expiry.
- Update `useBranchSubscription` types and `BranchSubscriptionPanel` to render trial state ("12 days left" pill).
- `start-branch-trial` edge function: idempotent, uses `supabase.auth.getUser()`, only stamps if `assigned_plan_slug` set and `trial_started_at` is null.
- Re-assign existing PostNet branches: bulk migration to set `assigned_plan_slug='postnet'` on all ~500 branches currently on `core/free` (keeps `trial_status='not_started'` so nothing fires until each branch's first login).

## Out of scope (flag for later)

- Full PayFast checkout + ITN webhook integration
- Per-branch Stripe Connect (currently a single Stripe account collects on PostNet's behalf)
- Multi-currency for non-ZA postnet branches (only ZA priced for now)
