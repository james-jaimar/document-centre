

# Plan: Tenant Storefront URL Strategy

## The three standard approaches for multi-tenant SaaS

1. **Path-based** — `app.example.com/t/postnet/dashboard`
2. **Subdomain-based** — `postnet.document-centre.app/dashboard`
3. **Custom domain** — `print.postnet.co.za` → CNAME to platform

## Recommendation: Path-based routing + custom domain support

**Why not subdomains?** Lovable deploys to a single origin (`document-centre.lovable.app`). Wildcard subdomain routing requires DNS + server config that Lovable doesn't control. Subdomains are a non-starter on this hosting platform.

**Path-based** is the pragmatic v1 — works immediately with current infrastructure. The customer portal URL becomes `/t/{tenant-slug}/dashboard` instead of `/dashboard`. The slug already exists on the `tenants` table.

**Custom domains** are the premium tier — tenants point a CNAME/A record at the platform, and a lookup table maps the hostname to the tenant. This requires a reverse proxy layer (Cloudflare Workers, Vercel middleware, etc.) which is outside Lovable's current hosting but should be modeled in the database now so the data layer is ready.

## What we will build

### 1. Database: add `custom_domain` column to tenants
- `custom_domain TEXT` (nullable, unique) — e.g. `print.postnet.co.za`
- `storefront_path TEXT` (generated or derived from slug) — e.g. `/t/postnet`
- This is just a migration to add the column; no domain verification logic yet

### 2. Tenant resolution middleware (React-level)
- Create a `useTenantFromUrl()` hook that:
  - Checks if the URL starts with `/t/:slug/` → looks up tenant by slug
  - Falls back to the existing `useTenantContext` membership-based resolution
- This hook feeds into the existing `TenantProvider` so all downstream queries stay scoped

### 3. Reroute customer portal under `/t/:slug/`
- Current: `/dashboard`, `/dashboard/orders`, `/dashboard/orders/new`, etc.
- New: `/t/:slug/dashboard`, `/t/:slug/orders`, `/t/:slug/orders/new`, etc.
- Add a redirect from `/dashboard` → `/t/{user's-tenant-slug}/dashboard` for logged-in users
- The `CustomerLayout` reads the slug param and sets the tenant context accordingly

### 4. Expose storefront URL in tenant admin settings
- On the General tab of AdminSettings, show the tenant's storefront URL (read-only, derived from slug)
- Add an editable `custom_domain` field for future use
- Show both: "Platform URL: `document-centre.lovable.app/t/postnet`" and "Custom Domain: `print.postnet.co.za` (DNS setup required)"

### 5. Update PlatformTenants to show storefront URL
- Display the `/t/{slug}` URL on each tenant card as a clickable link

## Files to create/modify

- **Migration**: Add `custom_domain` column to `tenants`
- **`src/hooks/useTenantFromSlug.ts`** (new) — resolve tenant by URL slug
- **`src/App.tsx`** — add `/t/:slug/*` route group wrapping CustomerLayout
- **`src/components/CustomerLayout.tsx`** — read slug param, set tenant context
- **`src/pages/admin/settings/GeneralTab.tsx`** — show storefront URL + custom domain field
- **`src/pages/platform/PlatformTenants.tsx`** — show storefront link per tenant
- **`src/integrations/supabase/types.ts`** — auto-updated after migration

## What this does NOT include (future work)
- Actual custom domain verification/provisioning (requires infrastructure outside Lovable)
- Wildcard subdomain routing
- Public signup/registration per tenant storefront
- Tenant-specific theming on the storefront (branding colors are stored but not yet applied)

## Implementation order
1. Database migration (add `custom_domain` to tenants)
2. Create `useTenantFromSlug` hook
3. Update App.tsx routing with `/t/:slug/*` paths
4. Update CustomerLayout to consume slug
5. Update GeneralTab and PlatformTenants to display URLs

