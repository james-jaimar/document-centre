## Problem

Clicking **Reset to pending** on Aliwal North fails with "Edge Function returned a non-2xx status code".

Root cause: in `supabase/functions/override-branch-subscription/index.ts`, the `reset_pending` branch sets `patch.trial_status = null`. The `branch_subscriptions.trial_status` column is `NOT NULL` (default `'not_started'`), so the upsert raises a NOT NULL violation and the function returns 500.

## Fix

One-line change in the `reset_pending` case:

```ts
patch.trial_status = "not_started";   // was: null
```

Everything else in that case (clearing `trial_started_at`, `trial_ends_at`, `trial_started_via`, `stripe_subscription_id`, period dates, comp/grace, reopening storefront, billing_status = pending_payment, status = incomplete) stays as-is.

No DB migration, no frontend changes.

## Verification

After the edit:
1. Open Aliwal North → Subscription tab → **Reset to pending** — should succeed and the badges should flip to `incomplete` / `pending payment`.
2. Logging back in as a branch user for Aliwal North should show the 3-card activation chooser (14-day trial / 30-day trial / pay now).
