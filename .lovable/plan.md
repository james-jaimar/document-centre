# Fix: branch/staff users dropped into customer storefront after sign-in

## Root cause
`src/pages/Auth.tsx` (added in commit `2c421c2d`, May 30) honors a `?redirect=` query param **before** the role-based landing:

```ts
const target = safeRedirect ?? resolveTenantLanding(primary, tenantSlug);
navigate(target, { replace: true });
```

When a staff/branch user clicks Sign In from any public storefront page (e.g. `/sandton-city/print-centre`), the link includes `?redirect=<that path>`. After login the override sends them back to the customer storefront instead of `/branch` (branch roles) or `/admin?tenant=…` (tenant staff).

The `?redirect=` feature is legitimate for **customer** roles (deep-link back to the page they were viewing), but it should never override a role landing for staff.

## Change

In `src/pages/Auth.tsx`, only apply `safeRedirect` when the primary membership role is `customer`. For all other roles, always use `resolveTenantLanding(...)`.

```ts
const STAFF_OR_BRANCH = new Set([
  "owner","admin","sales","production","accounts",
  "branch_manager","store_operator",
]);

const useRedirectOverride = !STAFF_OR_BRANCH.has(primary.role as string);
const target = (useRedirectOverride && safeRedirect)
  ? safeRedirect
  : resolveTenantLanding(primary, tenantSlug ?? null);
```

Apply the same guard to the `platform_admin` branch above (it already ignores `safeRedirect` — leave as-is).

## Verification
1. Sign out, visit `https://postnetprintcentre.com/sandton-city/print-centre`, click Sign In, enter `sandtoncityadmin@postnet.co.za` → should land on `/branch`.
2. Same flow with `sandtonstaff1@postnet.co.za` (store_operator) → should also land on `/branch`.
3. Customer account signing in from `/sandton-city/orders/new?...` → should still return to that deep link (redirect honored).
4. Tenant owner/admin signing in from the storefront → should land on tenant admin console, not storefront.

## Scope
Single-file frontend change to `src/pages/Auth.tsx`. No DB, no edge-function, no other route changes.
