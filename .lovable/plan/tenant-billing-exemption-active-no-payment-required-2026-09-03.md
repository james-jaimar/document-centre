# Tenant billing exemption ("active, no payment required")

Today there is no way to mark a whole tenant as free. The only free-pass mechanism is a per-branch "comp" override (`branch_subscriptions.comp_until`) set from Platform → Branch Subscriptions, one branch at a time, for a fixed number of days. New branches created later start at `restricted` again, and a branch with no subscription row is restricted outright.

This adds a tenant-level switch: **Billing exempt** — every branch of that tenant is entitled to operate indefinitely, with no plan, trial or payment required.

## Behaviour

- Platform admin opens a tenant (Platform → Subscriptions) and toggles "Billing exempt — no payment required", optionally with a reason and an optional end date (blank = indefinite).
- While exempt:
  - Every branch of the tenant resolves as entitled/active, even with no subscription row and no plan assigned.
  - No subscription-required modal, no billing-only lockout in the branch admin, no storefront "temporarily unavailable" from the entitlement gate.
  - Branches created later are covered automatically — nothing to re-apply.
  - Trial expiry does not restrict them.
- Tenant Settings → Billing (read-only for tenant admins) shows a clear "Complimentary — no payment required" badge instead of plan/price/trial terms.
- Turning it off returns the tenant to normal rules immediately (whatever plan/trial/payment state each branch actually has).
- A manually closed storefront (`storefront_closed_at`) still wins — exemption does not silently reopen a store an admin deliberately closed.

## Technical notes

Database (single migration):
- Add to `public.tenants`: `billing_exempt boolean not null default false`, `billing_exempt_until timestamptz null`, `billing_exempt_reason text null`.
- Extend the tenant billing-column guard so tenant admins cannot set these — platform admin / service role only.
- Update `resolve_branch_entitlement(_branch_id)`: after the `storefront_closed_at` check and **before** the `no_subscription` early return, look up the branch's tenant; if `billing_exempt` and (`billing_exempt_until` is null or in the future), return `{state:'active', reason:'tenant_exempt', until: billing_exempt_until}`.
- Update `platform_list_branch_subscriptions` to surface the exempt flag so the platform table can badge it.

Edge functions:
- `override-branch-subscription`: add actions `set_tenant_exempt` / `clear_tenant_exempt` (platform-admin only, already enforced) writing the tenant columns and logging to `platform_admin_audit`; or add a small `set-tenant-billing-exempt` function if that keeps the branch-scoped function cleaner. Prefer extending the existing function.

Frontend:
- `src/pages/platform/PlatformSubscriptions.tsx` — per-tenant "Comp / no payment" action and an "Exempt" badge in the Billing Status column.
- `src/hooks/usePlatformSubscriptions.ts` — mutation for the new action.
- `src/components/admin/billing/TenantPlanAssignmentCard.tsx` — show the complimentary state in both the platform (editable) and tenant (read-only) views.
- `src/pages/platform/PlatformBranchSubscriptions.tsx` — show "Exempt (tenant)" where relevant.
- No changes to `BranchSubscriptionPanel`, checkout, Stripe, or dunning: the guards all read the entitlement resolver, so they follow automatically.
