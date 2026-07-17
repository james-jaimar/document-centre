## The bug (reproduced from the data)

Your `demo3new` branch row shows `trial_status='active'`, `trial_started_at=2026-07-17 05:41:40` (about the time you signed in) — stamped **automatically** without you clicking anything. That's why the "Choose your subscription" modal flashed for ~3 seconds and vanished: the modal's `isActive` check flips to true the moment `trial_started_at` gets written.

Root cause: `src/components/BranchLayout.tsx` (lines 51–82) runs a `useEffect` on branch entry that calls the `start-branch-trial` edge function as soon as it sees an assigned plan with no trial yet. That silently burns the branch's one-shot 14-day no-card trial before the branch manager sees the modal, and never gives them the chance to pick the 30-day-with-card trial or pay upfront.

`BranchSubscriptionPanel` (the body of the modal) already exposes the correct three-way choice — "Start 14-day trial", "Start 30-day trial (card required)", "Pay now" — each wired to `start-branch-trial` / `create-branch-checkout` on explicit click. The auto-start effect duplicates the first option and short-circuits the decision.

## Fix

**`src/components/BranchLayout.tsx`** — remove the auto-start block:

- Delete the `useEffect` at lines 51–82, the `startedRef` `useRef`, the `useBranchSubscription(branchId)` call at line 49, and the now-unused imports (`useEffect`, `useRef`, `useQueryClient`, `useBranchSubscription`, `invokeEdgeFunctionVerbose`, `supabase`).
- Nothing else in `BranchLayout` depends on `sub` / `subLoading`, so the layout continues to render exactly as before.

The subscription decision is then owned entirely by `BranchSubscriptionRequiredModal` + `BranchSubscriptionPanel`, which is where the required-documents acceptance gate and per-option handlers already live. The modal stays open until the manager clicks one of the three buttons.

## One-shot data repair for your test branch

Your `demo3new` trial is already stamped from the auto-start. Roll it back so you can re-test the modal end-to-end:

```
UPDATE branch_subscriptions
SET trial_status = NULL, trial_started_at = NULL, trial_ends_at = NULL,
    trial_started_via = NULL
WHERE branch_id = 'f691ce51-5ad1-40ab-9713-49322ae5b68d';
```

Scoped to that one branch only.

## Out of scope

- No changes to `start-branch-trial`, `create-branch-checkout`, the modal itself, or the panel — they already do the right thing on explicit click.
- No changes to the tenant-driven plan assignment, discounts, or trial-day config.
- No change to the modal's "no assigned plan → don't block" fallback.

## Verification

- Reset the test branch (SQL above), sign in as branch manager → modal appears and **stays** open.
- Click "Start 14-day trial" → trial starts, modal closes, dashboard loads.
- Repeat with a fresh branch and click "Start 30-day trial (card required)" → routes to Stripe checkout instead. Same for "Pay now".
