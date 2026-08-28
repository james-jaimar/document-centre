# Fix: assigned trial doesn't unblock the storefront

## What's happening

The Impress Print Calendars branch ("Intersite Avenue") has a plan assigned (`3at1_basic`) with trial days set, but the subscription row shows:

- `status: incomplete`
- `billing_status: pending_payment`
- `trial_status: not_started`, `trial_started_at: null`, `trial_ends_at: null`

The entitlement resolver only reports "trialing" when `trial_ends_at` is in the future. With no trial dates it falls through to `restricted`, and the storefront gate shows "This store is temporarily unavailable."

Confirmed cause: assigning a plan stores `trial_days` as a number but never actually starts the trial — it doesn't set `trial_started_at`, `trial_ends_at`, or `trial_status`, and it forces `status = incomplete` for any paid plan. So a trial assigned from admin can never be honoured.

## The fix

1. When a plan is assigned with `trial_days > 0` (and the branch hasn't already used a trial), also set:
   - `trial_started_at = now()`
   - `trial_ends_at = now() + trial_days`
   - `trial_status = active`
   - `status = trialing` (instead of `incomplete`)
   Free plans keep behaving as today (`active` / `free`).
   If a trial has already been started or consumed, keep the existing trial dates rather than restarting it.
2. Repair the existing Impress branch record so its trial runs from now for the assigned trial length, restoring storefront access immediately.
3. Sanity-check any other branches in the same broken state (plan assigned with `trial_days` but `trial_status = not_started`) and repair them the same way.

## Technical notes

- Edit `supabase/functions/assign-branch-plan/index.ts` — extend the upsert payload with the trial fields, reading the existing row first so an in-flight or expired trial isn't reset.
- No schema change needed; `resolve_branch_entitlement` already handles `trial_ends_at` correctly.
- Data repair via a data update on `branch_subscriptions` (not a migration).
