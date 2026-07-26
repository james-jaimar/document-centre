## Problem

When a branch clicks **Subscribe now** and the browser sends them to Stripe Checkout, `create-branch-checkout` immediately writes `status: "incomplete", billing_status: "pending_payment"` onto `branch_subscriptions` (as part of the "create Stripe customer" branch of the upsert). If the user hits the browser Back button instead of completing or cancelling checkout, Stripe never fires a webhook, so that row is left in `incomplete` / `pending_payment` forever.

`resolve_branch_entitlement` then falls through its trial / active / grace / past_due checks and returns:

```
{ state: "restricted", reason: "incomplete" }
```

Result: the branch is locked out of the storefront and the admin sees the red **"This branch is read-only — Subscription is restricted"** banner (matches the screenshot), even though the customer never actually did anything.

## Root cause (verified)

Confirmed by reading:
- `supabase/functions/create-branch-checkout/index.ts` — the upsert that stamps `status: "incomplete", billing_status: "pending_payment"` when it first creates a Stripe customer.
- `supabase/migrations/20260720082314_…_.sql` — `resolve_branch_entitlement` returns `restricted` when `status` is `incomplete` and there is no active trial / paid state to override it.

## Fix

1. **Stop `create-branch-checkout` from downgrading entitlement state.**
   Split the "ensure Stripe customer exists" step from the "record subscription lifecycle" step. Persist `stripe_customer_id` (and `tenant_id`) without touching `status` or `billing_status`:
   - If a row exists → `update` only `stripe_customer_id` (and `updated_at`).
   - If no row exists → `insert` a minimal row with `branch_id`, `tenant_id`, `stripe_customer_id`. No `status`, no `billing_status`.
   
   Status transitions should come exclusively from Stripe webhooks (`stripe-webhook`) or the trial helpers (`start_branch_trial`, `assign-branch-plan`).

2. **Also drop the `status: 'incomplete'` write from the trial-days branch further down** — same reasoning; a Checkout session that isn't completed shouldn't restrict a branch.

3. **Self-heal existing stuck rows** in the same migration/deploy:
   ```sql
   UPDATE public.branch_subscriptions
   SET status = NULL, billing_status = NULL, updated_at = now()
   WHERE status = 'incomplete'
     AND billing_status = 'pending_payment'
     AND stripe_subscription_id IS NULL;
   ```
   This unblocks branches (including the one in the screenshot) that got wedged by the current bug. `resolve_branch_entitlement` will then re-evaluate them normally (trialing if `trial_ends_at` is in the future, otherwise `restricted` with reason `no_subscription`, which correctly re-shows the "pick a plan / start trial" modal).

4. **Verification**
   - Re-run `resolve_branch_entitlement` for the affected demo4 branch and confirm state is no longer `restricted` with reason `incomplete`.
   - Manually open `create-branch-checkout` for a trialing branch, cancel the redirect in the browser, and confirm entitlement stays `trialing`.

## Out of scope

- No changes to Stripe webhook handling — successful subscriptions still transition to `active` normally.
- No UI changes; `BranchSubscriptionRequiredModal` / `BranchSubscriptionPanel` already show the right recovery UI whenever entitlement is `restricted` for a legitimate reason (trial expired, no plan, etc.).