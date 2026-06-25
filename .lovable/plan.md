# Admin controls for branch subscriptions

## Problem

On a branch's **Subscription** tab (e.g. PostNet Aliwal North), the admin card is read-only. Once a branch has any subscription row — even a stale "free / active" one from an earlier assignment — there is no way to:

- Re-assign it to a different plan,
- Reset it back to `pending_payment` so the branch sees the trial/pay chooser again,
- Cancel it outright.

The card also still says *"Plan is inherited from the tenant's subscription"*, which no longer matches our per-branch model.

## What we'll build

Upgrade `BranchSubscriptionAssignCard` (rendered on `/admin/branches/:id` → Subscription tab) with three admin actions plus accurate copy.

### 1. Change / Assign plan
- Button → opens a small dialog with: region (auto from branch), plan dropdown (from `platform_pricing_plans` for that region), optional discount %, optional trial days, notes.
- Calls the existing `assign-branch-plan` edge function (already supports re-assignment).
- Works whether the branch currently has a row or not, replacing both "Activate branch" and "Assign plan" entry points with one consistent action.

### 2. Reset to pending payment
- Button (with confirm dialog) → sets the branch_subscriptions row back to a clean pre-activation state:
  - `status = 'incomplete'`
  - `billing_status = 'pending_payment'`
  - `trial_status = NULL`, `trial_ends_at = NULL`, `trial_started_via = NULL`
  - `current_period_start/end = NULL`
  - keeps `assigned_plan_slug` / `assigned_region_id` / `tenant_id` so the branch still has a plan to activate
  - if a live Stripe sub exists, do **not** touch Stripe here (use Cancel for that) — just unlink (`stripe_subscription_id = NULL`) so the next checkout starts a fresh sub.
- Branch user, on next login, sees the 3-card activation chooser again.

### 3. Cancel subscription
- Button (with confirm dialog) → cancels at Stripe (`stripe.subscriptions.cancel`) if `stripe_subscription_id` is set, then sets `status = 'cancelled'`, `cancelled_at = now()`.
- Branch goes read-only via the existing `useBranchSubscriptionGate`.

### 4. Copy fix
Replace the "inherited from tenant" sentence with: *"Each branch is billed individually. Use the actions below to assign, reset, or cancel this branch's subscription."*

## Technical notes

- **New edge function `reset-branch-subscription`** (platform/tenant-admin only): performs the field reset described above. Audit log entry written.
- **New edge function `cancel-branch-subscription`** (platform/tenant-admin only): cancels Stripe sub (if any) + flips status. Audit log entry.
- **Existing `assign-branch-plan`** already handles both first-time assign and re-assign — wire the dialog to it; no backend change needed.
- New hooks in `src/hooks/useBranchSubscriptions.ts`: `useResetBranchSubscription`, `useCancelBranchSubscription` (mirror the existing `useOverrideBranchSubscription` pattern).
- New dialog component `ChangeBranchPlanDialog.tsx` inside `src/components/admin/branches/`.
- Permission guard: only users with `tenant_memberships` role of Owner/Admin on the tenant (or platform admins) see these buttons — same gate the rest of `/admin/branches/:id` uses.

## Files touched

- `src/components/admin/branches/BranchSubscriptionAssignCard.tsx` (add actions + copy fix)
- `src/components/admin/branches/ChangeBranchPlanDialog.tsx` (new)
- `src/hooks/useBranchSubscriptions.ts` (two new mutation hooks)
- `supabase/functions/reset-branch-subscription/index.ts` (new)
- `supabase/functions/cancel-branch-subscription/index.ts` (new)
- `supabase/config.toml` (register the two new functions)

## Out of scope

- No changes to the branch-side panel — once reset, the existing 3-card chooser handles re-activation.
- No bulk reset across all PostNet branches in this pass (we can add a tenant-level "reset all pending" later if you want it).
- No migration; we're only flipping existing column values.
