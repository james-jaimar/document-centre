
## Goal

Make the subscription onboarding follow the rules you and ChatGPT settled on:

- Every branch gets **one** trial path — never two.
- 14-day no-card trial = app-only entitlement, no Stripe sub.
- 30-day card trial = Stripe Checkout subscription with 30-day trial + intro coupon.
- "Subscribe now" = Stripe Checkout subscription with intro coupon, no trial.
- Once the trial is consumed (or expires), the only remaining option is **Subscribe now** — the other trial card disappears.
- After expiry, branch is locked out of the app and bounced to /billing.

Most of the plumbing is already there (`branch_subscriptions`, `start-branch-trial`, `create-branch-checkout`, `trial_started_via`, `useBranchEntitlement`). This plan closes the remaining gaps.

---

## 1. Enforce "one trial per branch" on the server

Both Edge Functions currently allow the other trial to be re-taken.

**`start-branch-trial`**
- Reject if `branch_subscriptions.trial_started_via IS NOT NULL` OR `trial_started_at IS NOT NULL` OR `stripe_subscription_id IS NOT NULL`. Return `{ error: "trial_already_used" }`.

**`create-branch-checkout`**
- When `trial_days >= 30` (i.e. the 30-day card trial path), reject if `trial_started_via IS NOT NULL` OR a Stripe subscription already exists. The "Subscribe now" path (trial_days = 0) is still allowed.

No DB migration needed — `trial_started_via` already exists and is stamped by both functions.

## 2. Hide the trial cards once a trial is consumed

In `src/components/branch/BranchSubscriptionPanel.tsx`:

- Compute `trialConsumed = !!subscription?.trial_started_via || !!subscription?.trial_started_at || !!subscription?.stripe_subscription_id || ["expired","cancelled","past_due"].includes(subscription?.status ?? "")`.
- If `trialConsumed`, hide both trial cards and show only the **Subscribe now** card with a note: *"Trial offers are once per branch. To continue, please activate your paid subscription."*
- Keep the "Manage billing in Stripe" button visible whenever a Stripe customer exists.

## 3. Expiry → lock out → /billing

`useBranchEntitlement` already returns `restricted` / `cancelled`. The customer storefront gate (`useBranchStorefrontGate`) already blocks checkout. Add:

- A 14-day no-card trial whose `trial_ends_at < now()` should resolve to `state = "restricted"`. Confirm `resolve_branch_entitlement` does this; if it currently keeps them on `trialing`, patch the SQL function to flip to `restricted` once `trial_ends_at` has passed and no Stripe sub exists.
- In `ProtectedRoute` (or a thin wrapper used by branch admin/dashboard routes), when `useBranchSubscriptionGate` returns `billingOnly = true`, redirect any non-billing route to `…/admin/settings/billing` (or the branch billing route, whichever the branch user lands on).

## 4. Make sure the Stripe 30-day-trial + 3-month coupon math is right

You currently apply `plan.stripe_coupon_id` (R250 off, repeating 3 months) and `subscription_data.trial_period_days = 30` in the same Checkout Session. Stripe attaches the coupon at subscription creation, so the 3-month repeating window can start counting from day 0 — meaning the customer can lose one discounted month to the trial.

Action:
- Add an optional `stripe_coupon_id_with_trial` column to `platform_pricing_plans` (nullable). When `trial_days > 0` and that column is set, use it instead of `stripe_coupon_id`.
- In Stripe, create a second coupon "R250 off, repeating 4 months" and paste its ID into that new field for the PostNet plan. That guarantees three discounted paid invoices after the 30-day trial regardless of how Stripe counts the duration.
- Verify with a Stripe Test Clock before going live; if Stripe in fact only counts paid invoices, you can clear the field and the function falls back to the normal 3-month coupon.

## 5. UX copy + ZAR

Sweep `BranchSubscriptionPanel.tsx` and the disclosure card for any `$` symbols; force `R` + integer rand. Replace card copy to match the ladder:

- **14-day free trial** — *No card required. Once used, the next step is a paid subscription.*
- **30-day free trial** — *Card required. Converts automatically after 30 days unless cancelled.*
- **Subscribe now** — *R499/month for the first 3 months, then R749/month.*

When `trialConsumed`, replace the heading with *"Your trial has been used — activate your subscription to continue."*

## 6. Post-checkout & webhook sanity

Already handled, just confirm:

- `stripe-order-webhook` (or whichever subscription webhook you have) updates `branch_subscriptions.status`, `trial_ends_at`, `current_period_end`, `stripe_subscription_id` on `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- On `invoice.payment_failed` set `status = past_due` (grace handled by `subscription-dunning-sweep`).
- On `customer.subscription.deleted` set `status = cancelled`.

If any of the six events above isn't wired, add them in a follow-up; flag them in the implementation pass.

---

## Files touched

- `supabase/functions/start-branch-trial/index.ts` — reject if trial already consumed.
- `supabase/functions/create-branch-checkout/index.ts` — reject 30-day-trial path if trial consumed; honour `stripe_coupon_id_with_trial`.
- `supabase/migrations/<new>.sql` — add `platform_pricing_plans.stripe_coupon_id_with_trial text`.
- `src/components/branch/BranchSubscriptionPanel.tsx` — hide trial cards once consumed, refreshed copy, ZAR.
- `src/components/ProtectedRoute.tsx` (or a small branch-route wrapper) — force redirect to /billing when entitlement is `restricted`/`cancelled`.
- `resolve_branch_entitlement` SQL function — confirm/patch expiry flip for no-card trials.

## Out of scope (call out, don't build)

- Customer-facing storefront gate already exists; no changes needed.
- Tenant central billing card on file — you said per branch, so nothing to do.
- Promo codes feature — separate workstream when you design real codes.

After approval I'll implement, then walk you through a manual test: invite → password → /choose-plan → pick 14-day → wait/cheat the clock → confirm only "Subscribe now" shows → checkout → portal.
