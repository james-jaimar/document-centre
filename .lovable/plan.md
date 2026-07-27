## Goal
Make the country selector per-tenant instead of global. Default OFF. Enable it only for tenants that actually serve multiple countries (Postnet).

## Changes

**1. Data**
- Add `show_country_selector boolean not null default false` to `public.tenants` (single migration; no RLS change needed — column follows existing tenant read policies).
- Backfill: set `true` for the Postnet tenant only. All others (3at1, Jetline, demo, etc.) stay `false`.

**2. Tenant branding admin**
- In the tenant admin Branding tab (`src/pages/admin/...` BrandingTab), add a toggle: **"Show country selector in storefront header"** with help text explaining it's for multi-country tenants.
- Wire read/write via the existing tenants update path.

**3. Storefront header gating**
- `src/components/CustomerHeader.tsx` and `src/components/customer/mobile/MobileHeader.tsx`: only render `<CountryFlagBadge />` when `tenant.show_country_selector === true`.
- Fetch the flag through the existing tenant hook (`useTenantBranding` / `useTenantFromHost`) — add the column to those selects if not already returned.

**4. Types**
- After migration approval, regenerated Supabase types will include the new column; update the two header components and BrandingTab to consume it.

## Out of scope
- No changes to `CountryFlagBadge` itself, `detect-region`, or `src/lib/countries.ts`.
- No change to the platform-level country list.
