## Goal

When a branch manager clicks the activation email, they should end up **signed in inside their branch admin**, with a **blocking "Choose your subscription" modal**, and only after picking a plan should they see the existing `BranchOnboardingChecklist` card.

Today the flow instead: sets password → signs them **out** → sends them to `/auth` to log in again → dashboard shows a dismissible checklist and nothing forces a subscription choice.

## What Changes

### 1. Keep the session after password reset (`src/pages/ResetPassword.tsx`)

When the reset came from a `welcome_token` (branch activation), do NOT sign out. Instead:

- Call `complete-onboarding-token` (already there).
- Read the branch/tenant slug from the URL path (already parsed as `m`).
- Skip `supabase.auth.signOut()`.
- `navigate` straight to the branch admin dashboard: `/t/:tenantSlug/:branchSlug/admin` (or the equivalent branch dashboard route — verify against `App.tsx` routes).
- Show a success toast: "Password set — welcome to your branch."

For non-welcome password resets (normal "forgot password"), keep the current sign-out + back-to-auth behaviour.

### 2. Add a blocking "Choose a plan" modal on the branch admin (`src/components/branch/BranchSubscriptionRequiredModal.tsx` — new)

A new modal component that:

- Reads `useBranchSubscription(branchId)`.
- Renders as an **undismissible** shadcn `<Dialog>` (no close button, `onOpenChange` no-op, ESC disabled) when the branch has **no active plan and no trial started** — i.e. `subscription.status` is null/`inactive` AND `!subscription.trial_started_at` AND `!subscription.stripe_subscription_id`.
- Reuses the trial/pay buttons + `SubscriptionDisclosureCard` acceptance UX from `BranchSubscriptionPanel` — extract the "action buttons + disclosure" block into a small shared sub-component (`BranchSubscriptionActions`) that both `BranchSubscriptionPanel` and the new modal render.
- Once the subscription becomes `trialing` / `active` / has `trial_started_at`, the modal auto-closes (driven by the query invalidation `BranchSubscriptionPanel` already does after each action).

### 3. Mount the modal on branch entry (`src/pages/branch/BranchDashboard.tsx`)

Add `<BranchSubscriptionRequiredModal branchId={branchId} />` near the top of the dashboard JSX (above `BranchOnboardingChecklist`). Because it renders as a Dialog overlay, it visually blocks the dashboard until a plan is chosen. The existing `BranchOnboardingChecklist` continues to render underneath and takes over once the modal closes.

No other pages get the modal — the branch admin router already guarantees they arrive at the dashboard first after activation.

### 4. Sanity: route path for post-reset redirect

Verify the branch dashboard route in the router. The onboarding checklist links use `/branch/settings…` paths, so the tenant/branch scoping is elsewhere. Confirm the exact prefix (`/t/:tenantSlug/:branchSlug` vs `/t/:tenantSlug`) that resolves to `BranchDashboard` and use that literal string in the ResetPassword redirect.

## Out of Scope

- Changing the activation email itself, the `redeem-onboarding-token` edge function, or the opaque-token DB schema.
- Turning the onboarding checklist into a guided wizard — user explicitly asked to keep the current card.
- Adding new subscription plans, pricing logic, or Stripe changes.
- Any changes to the customer-facing (`/t/:slug/*`) portal.

## Files Touched

- `src/pages/ResetPassword.tsx` — conditional post-reset behaviour when `welcome_token` is present.
- `src/components/branch/BranchSubscriptionRequiredModal.tsx` — new blocking modal.
- `src/components/branch/BranchSubscriptionActions.tsx` — new shared sub-component (extracted from `BranchSubscriptionPanel`).
- `src/components/branch/BranchSubscriptionPanel.tsx` — refactor to consume the extracted actions sub-component (no UX change).
- `src/pages/branch/BranchDashboard.tsx` — mount the modal.

## Expected Result

1. Recipient clicks activation email → `/welcome?token=…` → recovery link → `/t/:slug/reset-password?welcome_token=…`.
2. Sets password → stays signed in → lands on `/t/:tenantSlug/:branchSlug/admin`.
3. Blocking modal appears: "Choose your subscription" with trial/pay options and required disclosures.
4. After picking a plan or trial, modal closes → the existing `BranchOnboardingChecklist` card guides them through company details, banking, pricing, email, PayFast, team, first order.
