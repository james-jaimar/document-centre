## Goal

Stop having subscription assignment in two places. Make Tenant Settings → Billing the single source of truth, and fix "Verify with Stripe" so it both shows up next to the price and writes the live Stripe values back into the database.

## Part 1 — One place to assign a subscription

Remove the **"Assign Subscription"** modal from the Platform side entirely:

- **Tenant Management** (`src/pages/platform/PlatformTenants.tsx`) — remove the "Subscription" button on each tenant card and the `TenantSubscriptionDialog` mount. Replace the action with a link/button "Manage subscription" that deep-links into that tenant's admin: `/admin/settings?tab=billing` (using the existing tenant-jump flow).
- **Platform → Subscriptions page** (`src/pages/platform/PlatformSubscriptions.tsx`) — keep the read-only overview table (who's on what plan, status, MRR, etc.) but remove the "Assign / Edit" action and the dialog mount. Each row gets a "Open tenant billing" link instead.
- **Delete** `src/components/platform/TenantSubscriptionDialog.tsx` once both call-sites are clean.

Result: the only place to assign or change a plan is **Tenant → Settings → Billing → Tenant Subscription Plan** (the `TenantPlanAssignmentCard`).

## Part 2 — Fix "Verify with Stripe" so you can actually see it and it updates the DB

### 2a. Move/duplicate the Verify button to the price row

Currently `Verify with Stripe` only lives in the coupon row of `PlatformPricingRegions.tsx` (line 593-602), inside Section C (Stripe Coupon / Promo Code). That's why you can't find it.

- Add a **"Verify with Stripe"** button next to every `stripe_price_id` cell in Section B (Branch Plan Prices), so it sits right under the price field for each region/plan combo.
- Keep the one in the coupon section too (it's useful there).

### 2b. Make Verify write back to the DB, not just toast

Today `verifyAgainstStripe()` invokes `stripe-verify-price` and only shows a toast. Change it so:

1. Call `stripe-verify-price` (existing edge function — no change needed there).
2. If the live Stripe price differs from the stored `price` (in rands), **update `platform_pricing_plans.price`** and `currency` for that row.
3. If the coupon is invalid/expired or the price is inactive, mark it visibly (badge) and warn but don't auto-clear the id — admin decides.
4. Update local state so the table reflects the new value immediately.
5. Toast a clear summary: "Updated R749 → R799 from Stripe" or "Already in sync ✓".

### 2c. Same Verify button inside the tenant Billing card

In `TenantPlanAssignmentCard.tsx`, next to the "Branch plan — Doc Centre Postnet — 749" select, add a small **"Refresh from Stripe"** button. It calls the same flow for the currently selected plan and re-fetches the plan list so the price label updates in place.

## Technical notes

- The edge function `stripe-verify-price` already returns `unit_amount_decimal`, `currency`, `recurring`, `active`, plus coupon/promo details. No edge-function changes required.
- DB writes go via the existing `platform_pricing_plans` UPDATE path (admin-only RLS already in place).
- No migration needed.
- `useBranchPlans` hook is already invalidated on save — we'll invalidate it after Verify too so all consumers (Tenant card, branch portal subscription panel) see the fresh price.

## Files touched

- `src/pages/platform/PlatformTenants.tsx` — remove subscription dialog trigger + mount, add link.
- `src/pages/platform/PlatformSubscriptions.tsx` — remove dialog trigger + mount, add link.
- `src/components/platform/TenantSubscriptionDialog.tsx` — delete.
- `src/pages/platform/PlatformPricingRegions.tsx` — add Verify button to price row; rewrite `verifyAgainstStripe` to UPDATE the DB row and refresh local state.
- `src/components/admin/billing/TenantPlanAssignmentCard.tsx` — add "Refresh from Stripe" button beside the plan select.

## Out of scope

- No change to the branch-level subscription panel (`BranchSubscriptionPanel.tsx`) — that's customer/branch-facing.
- No change to checkout, coupon, or trial logic.
- No webhook auto-sync (you said you want the manual Verify button, not webhooks).
