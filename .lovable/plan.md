
## Goal

Make the first login for a brand-new branch (like Demo3) feel guided — no duplicate acceptance UI, a clear "14-day no card vs 30-day with card vs Subscribe now" choice, then an unmissable, expanded checklist to take the store live.

---

## 1. Stop showing the "Updated terms need your acceptance" banner on first login

**Problem:** `useBranchDocsNeedingReacceptance` treats `latest === null` (no history) as "stale", so a branch that has never accepted anything sees the re-acceptance banner *and* the in-flow `SubscriptionDisclosureCard` — two acceptance UIs at once.

**Fix:** in `useBranchDocsNeedingReacceptance` only mark a doc stale when `latest !== null && latest < current` (i.e. they previously accepted an older version). Brand-new branches will skip the banner entirely; the disclosure card inside `BranchSubscriptionPanel` is the one and only acceptance UI during initial activation. Once they activate, all current versions are on file, and the banner only ever appears later when we bump a version.

---

## 2. Always present the trial selector on first activation

**Problem:** Demo3 is showing "Trial active — Add payment method" instead of the 14/30/Subscribe-now picker, because at some point `trial_status` was flipped to `active` on this branch (manual reset, prior testing, etc.). The picker logic in `BranchSubscriptionPanel` already exists and is correct — the issue is state, not UI.

**Fix:**
- Add a one-time SQL cleanup for Demo3 to clear `trial_status`, `trial_started_at`, `trial_ends_at`, `trial_started_via`, `stripe_subscription_id`, `billing_status='pending_payment'`, `status='incomplete'` so it renders as a fresh "isPending" branch and shows the three-card chooser.
- Tighten the disclosure copy on the 30-day card so the legal disclaimer is on the card itself, not buried: "Card required now. You will not be charged during the 30-day trial. On day 31 your card is charged the plan price unless you cancel from the billing portal before then."
- Keep the existing `SubscriptionDisclosureCard` underneath both choices (single acceptance, covers either path).

No new edge-function logic needed — `start-branch-trial` (14-day no card) and `create-branch-checkout` with `trial_days: 30` (30-day with card) already exist and are wired.

---

## 3. Expand and elevate the "Get your branch ready" checklist

The checklist already exists (`BranchOnboardingChecklist`) and renders on the Branch Dashboard. We make it impossible to miss and broaden the coverage so a branch manager can self-serve from zero to live.

**Where it shows:**
- Branch Dashboard (already there) — keep, but render it at the very top, above stats, while not complete.
- Branch Settings page — add it above the tab bar, so anyone landing on Settings to "fix something" still sees overall progress.
- Subscription panel — once the subscription becomes active or trialing, show a one-line "Next: finish setup →" CTA pointing at the checklist.

**Steps (revised list — replaces current 6):**

| # | Step | Tab / route | "Done" signal |
|---|------|-------------|---------------|
| 1 | Confirm company details | settings?tab=identity | trading name + address + phone set |
| 2 | Add banking details for invoices | settings?tab=identity | bank name + account number set |
| 3 | Upload your branding | settings?tab=identity | logo uploaded |
| 4 | Review your prices | /branch/pricing | branch has at least one price override OR explicitly clicked "Use platform pricing" |
| 5 | Set sender email | settings?tab=email | SMTP/Gmail/Graph account connected |
| 6 | Set up online payments (optional but recommended) | settings?tab=payments | at least one branch_payment_gateway is enabled + credentials saved |
| 7 | Invite your team | settings?tab=users | ≥1 branch user besides the owner |
| 8 | Run a test order | /branch/orders | first order placed |

The optional step (online payments) is marked with an "Optional" pill so branches that only invoice EFT are not nagged into completing it.

**Recompute logic:** extend the existing `recompute_branch_onboarding` SQL function to cover the two new signals (banking details, pricing review). Add a `pricing_reviewed_at` column on `branch_onboarding_progress` plus a small RPC `mark_branch_pricing_reviewed(branch_id)` so a "Use platform pricing as-is" button on `/branch/pricing` can satisfy that step without forcing an override.

**Dismiss behaviour:** keep the 7-day snooze, but also show a tiny persistent progress chip in the branch header sidebar (`3/8 setup`) so dismissing doesn't make it disappear forever.

---

## 4. Polish on the Subscription panel itself

- When the branch is in the "isPending" state (no trial yet, no subscription), hide the noisy red "branch is read-only" header — replace with a friendlier neutral banner "Choose how you'd like to start your subscription below."
- After successful trial start, scroll the page to the onboarding checklist and toast: "Trial started — let's finish setting up your branch."

---

## Technical notes

- Files touched:
  - `src/hooks/useBranchBillingSelfService.ts` — tighten stale-doc logic.
  - `src/components/branch/BranchSubscriptionPanel.tsx` — tweak 30-day card copy, post-activation toast + scroll.
  - `src/components/branch/BranchOnboardingChecklist.tsx` — new step list + Optional pill.
  - `src/pages/branch/BranchSettings.tsx` — render checklist above tabs; gentler banner when isPending.
  - `src/pages/branch/BranchPricing` (catalog pricing page) — "Use platform pricing as-is" button calling new RPC.
  - `src/components/branch/SidebarStatusChip` (new tiny component) — shows `n/8` in branch header.
- DB migration:
  - Add `pricing_reviewed_at timestamptz` to `branch_onboarding_progress`.
  - Rewrite `recompute_branch_onboarding` to include banking + pricing signals.
  - Add `mark_branch_pricing_reviewed(_branch_id uuid)` RPC.
  - One-shot UPDATE to reset Demo3 branch_subscription to "pending_payment / incomplete" with all trial fields nulled.

No new edge functions. No breaking changes to existing trial/checkout flows.
