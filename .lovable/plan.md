## Problem

On the custom domain `postnetprintcenter.com`, the demo gate never appears — the storefront loads normally, even in an incognito window. The `/t/:slug` path-based variant works because the route has a `:slug` param; on the custom domain the slug only exists in `TenantSlugContext` (set by `SubdomainWrapper`), and the guard's own tenant lookup is unreliable for anonymous visitors.

## Root cause

`DemoGateGuard` resolves the tenant by re-querying `tenants` with `.eq("slug", slug)` from the anon client. On the custom-domain root route this query returns `null` for unauthenticated visitors (anon RLS on `tenants` doesn't expose the row by slug the way the host-resolver edge path does). When `tenantId` is `null`, the guard short-circuits to `return <>{children}</>`, so visitors go straight to the storefront and never see the password screen.

## Fix

Stop re-querying `tenants` inside the guard. The tenant id is already resolved upstream and is available in two places:

1. `useSubdomainTenant()` (from `SubdomainRouter`) exposes the matched tenant id on custom domains and `{slug}.document-centre.com`.
2. `useTenantContext()` exposes `tenantId` for both subdomain and `/t/:slug` paths once the slug is known.

Rewrite `DemoGateGuard` to:

- Take `tenantId` from `useTenantContext()` first, falling back to a `tenants` lookup by slug only when context hasn't resolved yet (path-based `/t/:slug` before context settles).
- Keep the existing bypass logic (platform admin, tenant staff, unlocked cookie).
- Keep the `useDemoGateConfig` RPC call (it's `SECURITY DEFINER` and safe for anon).
- Render `<DemoGatePage>` whenever `config.enabled` is true and none of the bypasses match.

No changes to edge functions, DB, admin UI, or routing wiring in `App.tsx` — the guard is already wrapped around both the `/t/:slug` route and the custom-domain root route. This is purely a fix to how the guard discovers the tenant id on custom domains.

## Verification

1. In an incognito window, visit `https://postnetprintcenter.com/` → expect the demo gate (headline, disclaimer, password field) instead of the storefront.
2. Enter the password, accept the disclaimer → unlocked, storefront loads, cookie persists for the configured days.
3. Visit `/t/postnet` in incognito on the platform domain → gate still appears (path-based flow unchanged).
4. Sign in as a tenant staff member or platform admin → gate is bypassed on both hosts.

## Out of scope

- No changes to `tenant_demo_gate` schema, RLS, or the unlock/set-password edge functions.
- No change to the admin `DemoModeCard` UI.
- Not touching the existing "enabled without password" guard rail in admin.
