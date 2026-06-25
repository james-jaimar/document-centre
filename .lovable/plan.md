## Goal

Align the branch subscription activation flow with your mental model: admin assigns a plan, then on first login the branch chooses how to start (14-day no-card trial, 30-day trial with card, or pay now). The clock starts when the branch acts, not when the admin assigns.

## What changes

### 1. Per-plan "trial offer" toggle (Platform)

Add a `trial_offer` field to `platform_pricing_plans` controlling which start options branches see:
- `none` — Pay now only
- `trial_14_no_card` — 14-day no-card OR Pay now
- `trial_30_with_card` — 30-day with card OR Pay now
- `both` — all three options

Edit on the Platform → Plans editor. Default `both` for existing plans.

### 2. New "Activate subscription" UI (Branch)

In the branch Subscription panel, when `billing_status = pending_payment` and no Stripe sub exists yet, replace the single "Pay Now" button with a 3-card chooser (filtered by the plan's `trial_offer`):

```text
┌─ Start 14-day free trial ──┐ ┌─ Start 30-day trial ─────┐ ┌─ Activate now ───────┐
│ No card required           │ │ Card required, auto-     │ │ Pay immediately,     │
│ Full access for 14 days    │ │ charges on day 30        │ │ subscription live    │
│ [ Start free trial ]       │ │ [ Start trial with card ]│ │ [ Pay & activate ]   │
└────────────────────────────┘ └──────────────────────────┘ └──────────────────────┘
```

All three require legal acceptance checkboxes (same as today's checkout).

### 3. Wire each button

- **14-day no-card** → existing `start-branch-trial` edge function. Sets `trial_status=active`, `trial_ends_at = now+14d`, `billing_status=trialing`. No Stripe call.
- **30-day with card** → existing `create-branch-checkout` with `trial_days: 30`. Stripe owns the clock.
- **Pay now** → existing `create-branch-checkout` with `trial_days: 0`.

### 4. Trial-expiry transition

When the 14-day no-card trial ends, `resolve_branch_entitlement` already flips state to `restricted`. The panel will then show a single "Add card to continue" button → standard checkout (no trial). No backend change needed; just UI copy for the post-trial state.

### 5. Small backend tweaks

- `start-branch-trial`: check the plan's `trial_offer` allows `trial_14_no_card` before granting.
- `create-branch-checkout`: when `trial_days=30`, check the plan's `trial_offer` allows `trial_30_with_card`.
- Add a `trial_started_via` column (`no_card_14` | `stripe_30` | null) on `branch_subscriptions` for reporting.

## Out of scope

- Tenant-level "umbrella" billing
- Branch self-service plan switching
- Stripe Tax / `automatic_tax`
- Promo code → Stripe coupon sync
- Removing `tenant_subscriptions` legacy table

These stay as discussed — separate decisions for later.

## Files touched

- `supabase/migrations/<new>.sql` — add `trial_offer` to `platform_pricing_plans`, add `trial_started_via` to `branch_subscriptions`
- `src/pages/platform/PlatformPricingPlans.tsx` (or the plan editor component) — trial offer select
- `src/hooks/useBranchSubscriptions.ts` — expose `trial_offer` on plans
- `src/components/branch/SubscriptionPanel.tsx` (or wherever the current "Pay Now" lives) — new 3-card chooser
- `supabase/functions/start-branch-trial/index.ts` — enforce `trial_offer`
- `supabase/functions/create-branch-checkout/index.ts` — enforce `trial_offer` for 30-day path, record `trial_started_via`
- `supabase/functions/stripe-webhook/index.ts` — set `trial_started_via='stripe_30'` on trialing subs
