
## What's broken (verified in DB)

Demo2's `branch_subscriptions` row is:
- `trial_status = 'active'`, `trial_ends_at = 2026-08-03` (future)
- `trial_started_via = 'no_card_14'`
- `status = NULL`, `billing_status = 'pending_payment'`

`resolve_branch_entitlement` returns `restricted` for this row because its "trialing" branch is guarded by `sub.status NOT IN ('active')`. With `status = NULL`, that expression is `NULL` (not `TRUE`) in Postgres, so the trialing block is skipped and the function falls through to the final `restricted` return. That produces the contradictory UI: banner "read-only — restricted", panel "Trial ends 03/08/2026 — 14 days left on trial".

The onboarding checklist genuinely being 0/6 is correct — those steps (company details, banking, email, users, etc.) are unrelated to the disclosure checkboxes on the subscription panel. The user's "documents not marked" observation is about the subscription-page acceptance checkboxes not persisting: `start-branch-trial` never receives or records the `acceptances` payload, so `subscription_acceptances` stays empty and `BranchAcceptanceHistory` shows nothing after activation.

## Fixes

### 1. Entitlement RPC — handle NULL status
Migration updating `public.resolve_branch_entitlement`:
- Replace `sub.status NOT IN ('active')` with `COALESCE(sub.status,'') <> 'active'` in the trialing block, and the same in the "expired no-card trial" block.
- Same-migration backfill: for every row where `trial_status = 'active'` and `trial_ends_at > now()` and `status IS NULL`, set `status = 'trialing'` so historic rows resolve cleanly regardless of the RPC path.

### 2. `start-branch-trial` sets `status = 'trialing'`
In `start_branch_trial(_branch_id)` (and the edge function's post-RPC update), stamp `status = 'trialing'` alongside `trial_started_via = 'no_card_14'`. Prevents future rows from ever hitting the NULL-status trap even before the RPC change lands.

### 3. Persist acceptances on the 14-day path
- `BranchSubscriptionPanel.handleStartTrial14` already collects `accepted`; pass it through as `acceptances` to `start-branch-trial`.
- `supabase/functions/start-branch-trial/index.ts`: after the trial is stamped, insert one row per accepted document into `subscription_acceptances` (branch_id, tenant_id, document slug/version, accepted_at, user_id, ip/user-agent from request headers) — same shape already used by `create-branch-checkout` for the card paths.

### 4. 30-day-with-card and paid flows — audit + confirm parity
Read `create-branch-checkout` end-to-end and confirm:
- 30-day trial: session created with `subscription_data.trial_period_days = 30`; on `checkout.session.completed` webhook the branch row is stamped `status='trialing'`, `trial_started_via='stripe_30'`, `trial_ends_at`, `stripe_subscription_id`, and `subscription_acceptances` rows are written.
- Subscribe-now: webhook stamps `status='active'`, `billing_status='paid'`, `current_period_end`, `stripe_subscription_id`, and writes acceptances.
- Both paths must land the user on `/branch` with the entitlement guard resolving to `active`/`trialing` (no post-checkout "restricted" flash). If gaps are found, patch the webhook handler in the same change.

### 5. Sanity: banner + modal
`BranchLayout` banner and `BranchSubscriptionRequiredModal` both read `useBranchEntitlement`. Once #1 lands they'll clear automatically for Demo2 on the next fetch — no UI code change expected, but verify after deploying the migration by re-querying the RPC for Demo2's branch id.

## Out of scope
- The onboarding checklist counter (0/6) is behaving correctly; those steps still need to be completed by the branch admin.
- No changes to nudges, plan assignment, or storefront gate.

## Verification
- Re-run `resolve_branch_entitlement` for Demo2's branch id — expect `state = 'trialing'`.
- Fresh activation on a new branch → pick 14-day → confirm banner is gone, `subscription_acceptances` has rows, `status = 'trialing'`.
- Fresh activation → pick 30-day (card) → complete Stripe test checkout → confirm same.
- Fresh activation → Subscribe now → confirm `active`.
