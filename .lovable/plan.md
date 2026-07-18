# Trial expiry hard-stop

The DB entitlement (`resolve_branch_entitlement`) already flips a branch to `restricted` the moment `trial_ends_at` passes without a Stripe sub. Three gaps prevent this from being a real hard-stop:

1. Customers can still browse/configure orders on a restricted branch — only the Checkout submit is blocked.
2. Branch admin only shows a warning banner — all admin routes remain fully usable.
3. The activation modal (`BranchSubscriptionRequiredModal`) treats `trial_started_at` as "already active", so it never reappears after the trial expires.

Plan closes those three gaps and locks the recovery path to paid-subscription only.

## 1. Customer storefront — dark page when restricted/cancelled

- Add a small `<StorefrontEntitlementGuard>` wrapping the branch-scoped storefront routes inside `BranchSlugRoute` (both `/t/:slug/:branchSlug/*` and the subdomain equivalent in `src/App.tsx`).
- Uses `useBranchStorefrontGate(branchId)`. When `checkoutBlocked`, render a full-page "This store is temporarily unavailable" panel (tenant-branded, no configurator/cart routes rendered). Auth, legal, and `/settings` remain reachable.
- Tenant-root `/t/:slug` (branch picker) stays open — restricted branches are simply not orderable once picked.

## 2. Branch admin — billing-only lockdown

- Add `<BranchAdminBillingOnlyGuard>` inside `BranchLayout` (below the existing banner).
- If `useBranchSubscriptionGate(branchId).billingOnly === true`, redirect via `<Navigate>` to `/branch/settings?tab=subscription` unless the current path is already `/branch/settings` (any tab) or `/branch/logout`.
- Sidebar links stay visible but non-billing items get `aria-disabled` styling; clicking still routes through the guard so redirection is enforced server-independently.
- Existing banner copy is kept; guard only fires for `restricted` / `cancelled` states (grace still allows normal use).

## 3. Fix the activation modal so it reappears after expiry

`src/components/branch/BranchSubscriptionRequiredModal.tsx`:
- Replace the ad-hoc `isActive` boolean with `useBranchEntitlement(branchId)`.
- Show the blocking modal whenever `state ∈ {restricted, cancelled}` and a plan is assigned. Hide on `active` / `trialing` / `grace`.
- Because the underlying panel already hides trial choices once `trial_started_via`, `trial_started_at`, or `stripe_subscription_id` is set, the expired branch will only see the "Subscribe now" card — no re-trial possible.

## 4. Make "trial expired" copy accurate even without cron

`BranchSubscriptionPanel` currently keys "trial ended" off `trial_status === 'expired'`, which requires a background sweep. Change the derivation to also treat `trial_ends_at < now()` (with any of `trial_started_at`, `trial_started_via`, `trial_status='active'`) as expired, so the correct copy appears the instant the timer runs out. No cron dependency.

## 5. Guarantee paid-only recovery path

Belt-and-braces server check in `supabase/functions/start-branch-trial/index.ts`:
- Reject if the branch already has `trial_started_at`, `trial_started_via`, `stripe_subscription_id`, or a passed `trial_ends_at`. Returns `409 trial_already_consumed`. Prevents any client bug from re-granting a free trial.

Reactivation itself already works: `stripe-webhook` writes `status='active'` on successful checkout, and `resolve_branch_entitlement` immediately returns `active`, releasing both guards.

## Technical details

- Files edited:
  - `src/App.tsx` — wrap branch-scoped customer routes with `StorefrontEntitlementGuard`.
  - `src/components/customer/StorefrontEntitlementGuard.tsx` *(new)* — reads `useBranchStorefrontGate`, renders closed-store panel or `<Outlet/>`.
  - `src/components/BranchLayout.tsx` — mount `BranchAdminBillingOnlyGuard`.
  - `src/components/branch/BranchAdminBillingOnlyGuard.tsx` *(new)* — route allow-list + `Navigate`.
  - `src/components/branch/BranchSubscriptionRequiredModal.tsx` — drive from `useBranchEntitlement`.
  - `src/components/branch/BranchSubscriptionPanel.tsx` — derive `trialExpired` from `trial_ends_at`.
  - `supabase/functions/start-branch-trial/index.ts` — server-side trial-consumed guard.
- No DB migration required (`resolve_branch_entitlement` already correct).
- Reactivation flow (`stripe-webhook` → entitlement recompute → guards release) is unchanged.

## Out of scope

- Nightly cron to also stamp `trial_status='expired'` on rows — nice-to-have for reporting, not required for enforcement. Can be added later if reporting needs it.
- Email nudges before expiry — separate task.
