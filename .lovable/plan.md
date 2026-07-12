## Problem

You landed at `/t/postnet/demo3?welcome_token=...` (the customer storefront) — so no password prompt, no subscription modal, no onboarding checklist. Those all live on `/branch` (BranchDashboard), which you never reached.

Root cause is in `supabase/functions/redeem-onboarding-token/index.ts`:

- It picks `recovery` vs `magiclink` based on whether the invited user has ever signed in before.
- Because your test user had a `last_sign_in_at`, it minted a **magiclink** and redirected to `${tenantSlug}/${branchSlug}` — i.e. the storefront — completely bypassing `/reset-password` and `/branch`.
- Even the `recovery` branch redirects to `/reset-password` without any hint that this is a **branch** activation, so it wouldn't reliably land on `/branch` afterwards either.

The subscription modal + onboarding checklist components are already correctly mounted on `BranchDashboard`. Nothing wrong there — the user just never gets to that page.

## Fix

Single edge-function change plus a tiny redirect tightening. No UI/business-logic changes elsewhere.

### 1. `supabase/functions/redeem-onboarding-token/index.ts`

When the onboarding token has a `branch_id` (branch activation), **always** mint a `recovery` link and redirect to `/reset-password`, regardless of `last_sign_in_at`. Rationale: branch activation must force a password set and then drop the user into the branch admin — not the storefront.

- Force `linkType = "recovery"` when `row.branch_id` is present.
- Redirect path for branch activations becomes `${slugPrefix}/reset-password?welcome_token=<token>&next=branch` (adding a `next=branch` marker so ResetPassword can be explicit about where to go).
- Non-branch tokens (tenant-only or pure customer) keep the existing behaviour.

### 2. `src/pages/ResetPassword.tsx`

After successful `updateUser({ password })` + `complete-onboarding-token`, honour the `next` param:

- `next=branch` → `navigate("/branch")` (branch admin — where the subscription modal + onboarding checklist live).
- Otherwise keep existing behaviour.

That's it. Once these two edits are in:

1. Click activation link → `/auth/verify` mints session → lands on `/reset-password?welcome_token=…&next=branch`.
2. User sets password (stays signed in) → redirected to `/branch`.
3. `BranchDashboard` renders → `BranchSubscriptionRequiredModal` blocks the UI until a plan/trial is chosen → `BranchOnboardingChecklist` shows below it.

## Technical notes

- `BranchSubscriptionRequiredModal` only blocks when `assigned_plan_slug` is set on the branch subscription. If your test branch has no plan assigned yet by platform admin, the modal will (correctly) not show — worth confirming for the Demo3 branch before testing.
- The magiclink path is preserved for future non-branch onboarding tokens (customer welcome links, etc.), so this doesn't regress those flows.