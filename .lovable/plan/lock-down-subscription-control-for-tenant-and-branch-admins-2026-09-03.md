# Lock down subscription control for tenant and branch admins

Today a tenant admin on Tenant Settings → Billing can change region, plan, discount type/value, trial length and billing notes, browse the live Stripe catalogue, re-verify (and silently rewrite) plan prices, and on a branch page assign/change a plan, reset a pending subscription, or force-cancel it. That is platform-level control. Tenant and branch admins should only be able to **see** what they are on and **pay** for it.

## Target behaviour

Platform admin (including while impersonating a tenant): unchanged, full control.

Tenant admin / owner:
- Billing tab becomes read-only: current plan, region, price, discount, trial terms, and per-branch subscription status shown as plain text/badges.
- No plan/region/discount/trial editors, no billing notes field, no "Save & apply to all branches", no "Browse Stripe catalogue", no "Verify current".
- Branch page shows subscription status only — no Assign/Change plan, no Reset pending, no Force cancel.
- A short line explaining that plan changes are made by Document Centre; contact support to change plan.

Branch manager:
- Branch Settings → Subscription keeps exactly what it has now (accept documents, start trial, pay/checkout, manage payment method via the Stripe portal). No plan or discount editing — it already has none.

## Server-side enforcement (the important part)

UI hiding is not enough; these endpoints must reject non-platform-admins:

- `assign-tenant-plan` — currently only checks that a user is logged in, then writes tenant plan/discount/trial fields with the **service-role** key (so RLS is bypassed entirely). Add a `user_roles` platform_admin check and return 403 otherwise.
- `override-branch-subscription` — currently allows tenant owner/admin. Restrict privileged actions (`comp`, `clear_comp`, `extend_grace`, `force_cancel`, `reset_trial`, `reopen_storefront`, `reset_pending`) to platform_admin only.
- `stripe-verify-price` — currently allows any active tenant member; it can rewrite `platform_pricing_plans.price`. Restrict to platform_admin.
- `assign-branch-plan` — already platform_admin only; leave as is.
- Also confirm RLS on `tenants` does not let a tenant admin write `assigned_plan_slug` / `assigned_discount_*` / `assigned_trial_days` directly from the client, and tighten to platform-admin-only writes on those columns if it does.

## Technical notes

- Gate the UI on `isPlatformAdmin` from `useTenantContext` (the same flag that already drives `isOverriding`), not on `membershipRole`.
- Files: `src/pages/admin/settings/BillingTab.tsx`, `src/components/admin/billing/TenantPlanAssignmentCard.tsx` (split into a read-only summary view + the existing editable view), `src/components/admin/branches/BranchSubscriptionAssignCard.tsx` (hide action buttons and the assign dialog for non-platform admins), `src/pages/admin/AdminBranchDetail.tsx` if needed.
- Edge functions: `supabase/functions/assign-tenant-plan/index.ts`, `override-branch-subscription/index.ts`, `stripe-verify-price/index.ts`. Redeploy after the change.
- No changes to `BranchSubscriptionPanel`, checkout, trials, or dunning.
