## Problem

In the demo storefront, the Checkout "Collection Branch" picker lists ~PostNet branches~ — branches that belong to a different tenant. This is cross-tenant data leakage.

## Root cause

Customer portal pages under `/t/:slug/*` derive `tenantId` from `useTenantContext()`, which resolves the tenant from the **signed-in user's `tenant_memberships`** (active membership = first by role priority).

`Checkout.tsx`:
```ts
const { tenantId } = useTenantContext();
// …
.from("branches").select(...).eq("tenant_id", tenantId)
```

The signed-in account (`jimmybhawkins@gmail.com`) has a membership in the PostNet tenant. When that user opens the demo storefront `/t/demo/...`, `useTenantContext` still returns the PostNet `tenant_id`, so every tenant-scoped query in the customer portal (branches, payment gateways, recent docs, orders, recipes, rate card, etc.) silently pulls from PostNet instead of demo. RLS does not block it because the user truly does have rights in PostNet — it's the wrong tenant being asked about.

The same pattern exists in at least: `Checkout.tsx`, `CustomerDashboard.tsx`, `CustomerOrders.tsx`, `CustomerOrderDetail.tsx`, `OrderBuild.tsx`, `OrderFiles.tsx`, `PhotoPrintsBuilder.tsx`. Any of them can leak.

`/admin` and `/platform` are fine — they're meant to be membership-scoped.

## Fix — single source of truth: URL slug wins on customer routes

Make `useTenantContext` URL-aware so customer pages cannot accidentally read the membership tenant.

### 1. `useTenantContext` becomes URL-aware

Inside `TenantProvider`, when the current pathname starts with `/t/:slug/...`:

- Resolve the tenant by slug (reuse `useTenantFromSlug` logic — query `tenants` by slug, cache result).
- Set `effectiveTenantId = slugTenant.id`, `effectiveAppId = slugTenant.app_id`, `effectiveTenantName = slugTenant.name`.
- `branchId` and `membershipRole` are not derived from any membership in this mode (return `null` unless the user happens to have a membership in *this* tenant; in that case use that membership for role).
- `loading` stays true until both memberships AND the slug-tenant lookup have resolved.

This guarantees: on `/t/demo/...`, `tenantId` is always the demo tenant, regardless of which other tenants the user belongs to.

`/admin/*`, `/platform/*`, `/dashboard/*` (legacy, non-slug) keep current behaviour — membership-derived with optional platform-admin override.

### 2. Defensive guard in `Checkout.tsx`

Even with the context fix, add a belt-and-braces check: assert `tenantId === slugTenant.id` and refuse to render the page (toast + redirect to `/t/:slug`) if they ever diverge. Cheap insurance.

### 3. Tighten `branches` SELECT RLS

Audit the `branches` SELECT policy. It must require either:
- the row's `tenant_id` matches a tenant the caller has membership in, OR
- the row belongs to a tenant that is `is_active = true` AND its slug matches the request — i.e. branches are publicly readable for active storefronts.

If today the policy is "any authenticated user can read all branches", that lets a script join branches across tenants. Restrict to `tenant_id IN (memberships of caller) OR EXISTS (tenants where id = branches.tenant_id AND is_active)` depending on whether storefront browsing must be anonymous-friendly. Confirm via `supabase--read_query` against `pg_policies` before writing the migration.

### 4. Audit other tenant-scoped tables read from the customer portal

Same RLS principle: payment gateways, product options, pricing rules, rate card, addresses, orders, order_items, documents — confirm SELECT policies are scoped so a row from tenant A can never be returned to a query that intended tenant B (i.e. policies should not depend solely on the WHERE clause being correct). For tables already correct, no change.

### 5. Add a regression test (vitest)

`tests/tenant-isolation.test.ts`: render `Checkout` with route `/t/demo/checkout` while mocking `useAuth` to return a user whose only membership is in tenant `postnet-id`. Assert the branches query is invoked with `tenant_id = <demo-id>`, not `<postnet-id>`.

## Technical notes

- `TenantSlugContext` already exists (`src/contexts/TenantSlugContext.tsx`) — `TenantProvider` can read the slug from it without touching `useLocation` parsing. Confirm the provider order in `App.tsx` so `TenantSlugContext` wraps `TenantProvider`; reorder if necessary.
- Cache the slug→tenant lookup in `TenantProvider` so we don't double-fetch what `useTenantFromSlug` already fetches.
- No DB changes required for the immediate leak fix; RLS hardening (step 3/4) is a separate, follow-up migration once we confirm current policies.
- `is_demo` flag is irrelevant to the fix — same logic applies to all tenants.

## Verification

1. Sign in as `jimmybhawkins@gmail.com` (PostNet member) on `/t/demo/checkout` → branch picker shows demo's branches only (or single-branch text), no PostNet entries.
2. Same user on `/t/postnet/checkout` → still sees PostNet's branches (regression check).
3. Anonymous (no membership) user on `/t/demo/checkout` → demo branches.
4. Platform admin override (`?tenant=...`) on `/admin` still works.
5. New vitest passes; existing suite still green.
