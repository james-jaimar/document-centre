## Problem
`SubscriptionDisclosureCard` renders with fresh local state on every mount, so a branch that has already ticked and persisted the four legal docs (during trial start or a previous checkout) still sees empty checkboxes. It has no awareness of the `subscription_acceptances` ledger.

## Fix
Make the card ledger-aware by reading existing acceptances for the branch and reflecting them in the UI.

### Changes
1. **`SubscriptionDisclosureCard.tsx`**
   - Accept a new `branchId` prop.
   - Use `useBranchAcceptanceHistory(branchId)` to find the latest accepted version per required slug.
   - For each doc:
     - If latest accepted version ≥ current canonical version → render the checkbox as **checked + disabled**, with a small "Accepted <date> (v<n>)" note next to the label.
     - Otherwise render the normal interactive checkbox (unchecked, or checked if previously ticked in this session).
   - Seed local `checked` state from the ledger on load so `onChange` fires immediately with the already-accepted docs. Parent's `accepted` state becomes non-null as soon as (ledger ∪ user ticks) covers all required docs — which unlocks "Add payment method" without forcing re-ticking.
   - When every required doc is already accepted at the current version, collapse the checkbox list into a single "Terms accepted — view history" summary line (keeping links to each doc).

2. **`BranchSubscriptionPanel.tsx`**
   - Pass `branchId` into both `<SubscriptionDisclosureCard>` instances.
   - No change to submit logic: the edge functions already de-duplicate by (branch, slug, version) so re-posting existing acceptances is safe, and the ledger-seeded state makes the disabled buttons enable correctly.

### Out of scope
- No changes to `record-branch-reacceptance`, `start-branch-trial`, or the ledger schema.
- Re-acceptance banner for stale versions is unchanged (it already handles the "newer version published" case).

## Verification
- Reload Postnet trial branch → all four docs show as checked + "Accepted <date>", "Add payment method" button is enabled without any user interaction.
- New branch with no ledger rows → card behaves exactly as today (empty checkboxes, button disabled until all ticked).
- Publish a new version of one doc → that row becomes an active unchecked checkbox again; others stay pre-accepted.
