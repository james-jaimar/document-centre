

# Plan: Tenant Landing Pages with Brand Scraping

## Overview

Create a public landing page system for each tenant at `/t/:slug` (currently this path requires auth). The landing page will be configurable per-tenant, with brand assets auto-populated by scraping the tenant's existing website using Firecrawl.

## Architecture

```text
  /t/postnet          ← PUBLIC landing page (no auth required)
  /t/postnet/auth     ← Login/register
  /t/postnet/dashboard← Protected customer portal (existing)
```

### Phase 1: Firecrawl Integration (scrape brand assets)

1. **Link Firecrawl connector** to the project
2. **Create Edge Function `scrape-branding`** that:
   - Accepts a URL (e.g. `postnet.co.za`)
   - Calls Firecrawl scrape with `formats: ['branding', 'screenshot', 'markdown']`
   - Returns extracted colors, logo URL, fonts, hero images, taglines
3. **Add "Import Branding" button** to the Admin BrandingTab that:
   - Accepts a website URL input
   - Calls the edge function
   - Pre-fills the color pickers, logo, portal name from scraped data
   - Admin reviews and saves to `tenant_settings`

### Phase 2: Extend Branding Settings Schema

Add new branding keys to `tenant_settings` (no migration needed — it's JSONB):
- `logo_url` — uploaded or scraped logo
- `hero_image_url` — hero/banner image
- `tagline` — brand tagline
- `font_heading` / `font_body` — font family names
- `cta_text` — call-to-action button text (default: "Start Printing")
- `landing_layout` — template choice (e.g. `hero_split`, `hero_centered`, `minimal`)

### Phase 3: Public Landing Page

1. **Create `src/pages/storefront/StorefrontLanding.tsx`** — a public page component that:
   - Uses `useTenantFromSlug()` to get the tenant
   - Fetches branding settings from `tenant_settings` (public read via RLS or a public function)
   - Renders a configurable landing page with:
     - Hero section (logo, tagline, hero image, CTA → `/t/:slug/auth`)
     - Product showcase (pulls enabled product families)
     - Footer with tenant details
   - Applies tenant brand colors via CSS custom properties

2. **Update routing in `App.tsx`**:
   - Add `<Route path="/t/:slug" element={<StorefrontLanding />} />` as an index route (public, no `ProtectedRoute`)
   - Keep `/t/:slug/dashboard` etc. protected as-is

3. **Add RLS policy** for public read access to `tenant_settings` where `category = 'branding'` and `is_sensitive = false`

### Phase 4: Admin Landing Page Editor

Extend the BrandingTab with:
- Logo upload (to `assets` bucket)
- Hero image upload
- Tagline and CTA text fields
- Layout template selector (visual picker)
- Live preview thumbnail

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | Link Firecrawl connector | Connector tool |
| 2 | Create `scrape-branding` edge function | `supabase/functions/scrape-branding/index.ts` |
| 3 | Extend BrandingTab with "Import from Website" | `src/pages/admin/settings/BrandingTab.tsx` |
| 4 | Add new branding fields (logo, hero, tagline, fonts, layout) | `src/pages/admin/settings/BrandingTab.tsx` |
| 5 | Create public landing page component | `src/pages/storefront/StorefrontLanding.tsx` |
| 6 | Add public route + RLS for branding read | `src/App.tsx`, migration |
| 7 | Create `useTenantBranding` hook for public access | `src/hooks/useTenantBranding.ts` |

## Technical Details

- **Firecrawl** is already available as a workspace connector (not yet linked). Uses `FIRECRAWL_API_KEY` env var directly (no gateway — `uses connector gateway: false`).
- **No new tables** — all branding config stored as rows in existing `tenant_settings` table.
- **One migration** needed: RLS policy allowing anonymous read of non-sensitive branding settings.
- **Landing page templates** are React components selected by the `landing_layout` setting key — starts with one template, expandable later.

