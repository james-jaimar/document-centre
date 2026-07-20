## Goal
Replace the auto-detection logic for branch onboarding steps with simple manual "Mark as done" checkboxes the branch owner controls.

## Changes

### 1. Database
- Add a new RPC `set_branch_onboarding_step(_branch_id uuid, _step text, _done boolean)` (SECURITY DEFINER, search_path=public) that:
  - Verifies caller is an owner/admin/manager of the branch via `tenant_memberships`.
  - Updates the given boolean column on `branch_onboarding_progress` (whitelisted step keys only: `company_details_done`, `banking_done`, `pricing_reviewed`, `email_settings_done`, `payfast_done`, `team_invited`, `first_order_done`).
  - Sets `completed_at = now()` when all required steps become true; clears it otherwise.
- Keep the row structure; stop relying on `recompute_branch_onboarding` for these flags (leave the function in place but the client won't call it).

### 2. Hook — `src/hooks/useBranchOnboarding.ts`
- Remove the `recompute_branch_onboarding` RPC call from `queryFn`.
- Add `useToggleBranchOnboardingStep()` mutation that calls the new RPC and invalidates `["branch_onboarding", branchId]`.

### 3. UI — `src/components/branch/BranchOnboardingChecklist.tsx`
- Turn each row's circle/check icon into an interactive checkbox (shadcn `Checkbox`) that toggles the step via the new mutation.
- Keep the "Go to settings" affordance: clicking the label/hint still navigates via the existing `Link`; only the checkbox toggles state (stopPropagation on the checkbox).
- Optional steps remain toggleable but don't count toward completion.
- Show a subtle "Saved" state / disabled while the mutation is pending.

## Out of scope
- No changes to what each settings screen does on save. Detection logic (`recompute_branch_onboarding`) stays in the DB unused for now — safe to remove later.
- No visual redesign beyond swapping the icon for a checkbox.