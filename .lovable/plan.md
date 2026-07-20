## Problem

When a branch is inside its 14-day trial, the Subscription tab (`BranchSubscriptionPanel.tsx`, `inTrial` branch) shows almost nothing useful:

- A one-line "Trial ends 8/3/2026 — add payment any time…"
- The full "Before you continue" disclosure card again (already accepted, so it's just noise)
- A small outline "Add payment method" button

There is no countdown, no explanation of what happens when the trial ends, no plan price, no benefits reminder, and no clear call to action. The branch owner isn't guided toward becoming a paying customer.

## Goal

Turn the in-trial view into a proper conversion surface that:
1. Makes the trial deadline and consequences unmistakable.
2. Explains the two outcomes: subscribe (keep everything) vs. do nothing (branch is restricted).
3. Shows the plan they'll roll onto with its price.
4. Provides one prominent, obvious "Subscribe now" action.
5. Doesn't re-prompt for legal acceptance when it's already on file — just links to the history.

Scope is UI/UX inside the branch subscription panel only. No changes to entitlement logic, edge functions, or DB.

## Changes

### 1. New `TrialConversionCard` component (`src/components/branch/TrialConversionCard.tsx`)

Replaces the current `inTrial` block. Contents:

- **Header row**: plan name + `Trial` badge + days-remaining pill (colour ramps green → amber → red as it approaches 0; uses `trial_ends_at`).
- **Countdown line**: "X days left — trial ends {formatted date}".
- **Two-column "what happens next" panel**:
  - ✅ *Subscribe before {date}* → seamless continuation, no downtime, everything you've set up stays live.
  - ⚠️ *Do nothing* → on {date} your storefront is paused, admin becomes billing-only until you subscribe. (Mirrors real behaviour of `useBranchStorefrontGate` / `BranchAdminBillingOnlyGuard`.)
- **Plan summary strip**: assigned plan name, price from `assignedPlan` (reuse the same query already in the panel), "billed monthly, cancel anytime, VAT not applicable" — same facts as the disclosure card's info box, but framed as the offer, not a legal disclaimer.
- **Primary CTA**: large full-width "Subscribe now — keep {branch} live" button that calls the existing `handleCheckout("pay")`.
- **Secondary link**: "View terms you accepted" → expands `BranchAcceptanceHistory` inline (component already exists).

### 2. Suppress the disclosure card when acceptances are already on file

- Lift the "already accepted everything at current version" check out of `SubscriptionDisclosureCard` (or expose a small `useBranchAllRequiredAccepted(branchId)` helper next to `useBranchAcceptanceHistory`).
- In `TrialConversionCard`, when all required docs are already accepted (the normal case for a branch that has been trialing), do **not** render the disclosure card. The CTA is enabled immediately and the checkout call passes the ledgered acceptances.
- If (edge case) required docs have version-bumped mid-trial, keep rendering `SubscriptionDisclosureCard` above the CTA — the existing re-acceptance banner already covers this, but the CTA should stay gated until the new versions are ticked.

### 3. Nudge banner when trial is close to ending

- Inside `TrialConversionCard`, if `daysLeft <= 3`, prepend a red banner: "Only {n} days left — subscribe now to avoid losing access on {date}."
- If `daysLeft <= 0` we fall through to the existing `isPending` / `trialExpired` branch (already handled — no change).

### 4. Small polish on the `isPending` / expired branch

- When `trialExpired` is true, prepend a clear "Your trial ended on {date}. Your branch is currently paused." explainer above the existing amber notice, so the state matches the language used during trial.
- No functional change; copy only.

## Technical notes

- No new hooks required beyond an optional `useBranchAllRequiredAccepted` helper that reuses `useBranchAcceptanceHistory` + `CHECKOUT_REQUIRED_DOCS` from `src/lib/legal/versions.ts`.
- Reuse existing queries (`useBranchSubscription`, `assignedPlan` query already in the panel) — pass `assignedPlan` down as a prop so we don't duplicate the fetch.
- Price formatting: use `assignedPlan.price_cents` / currency fields exactly as `SubscriptionDisclosureCard`'s parent already resolves them; no new currency logic.
- No DB, RLS, or edge-function changes. No changes to `BranchSubscriptionRequiredModal` (post-expiry blocking modal already works).

## Out of scope

- Email nudges before expiry (already implemented via `nudge-dispatcher`).
- Changes to the pre-trial "choose your path" cards (`isPending` first-visit view is already good).
- Any pricing/plan editing.
