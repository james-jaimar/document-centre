## Problem

The subdomain customer routes (`<Route path="/" element={<CustomerLayout />}>` at line 158 of App.tsx) are always mounted in the route tree. React Router matches them before the `MarketingLanding` route (line 332), so visiting `document-centre.com` (bare domain) renders the empty CustomerLayout instead of the marketing landing page.

## Fix

**Approach**: Make the subdomain routes conditional. Only include them when `useTenantFromHost` has matched a tenant subdomain.

### Changes

1. **`src/components/SubdomainRouter.tsx`** -- Export a new component `SubdomainRoutes` that renders the root-level customer routes only when a subdomain tenant is matched. Also expose `useSubdomainTenant()` so routing can branch conditionally.

2. **`src/App.tsx`** -- Replace the static subdomain route block (lines 157-176) with the conditional `SubdomainRoutes` component that only renders when on a tenant subdomain. The `MarketingLanding` route at `/` will then correctly match on the bare domain.

This is a small, surgical fix -- no other files need to change. The `/t/:slug` path-based routes remain untouched.
