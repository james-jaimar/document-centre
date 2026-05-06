
# Tenant-Branded Login Page

Currently the Auth page at `/t/:slug/auth` shows the tenant name and logo (if set), but uses a hardcoded blue gradient background and the default primary button color. We'll pull in the full tenant branding and apply it dynamically.

## What changes

**File: `src/pages/Auth.tsx`**

1. Import and call `useTenantBranding(brandedTenant?.id)` to fetch the tenant's branding settings (primary_color, secondary_color, accent_color, favicon_url, font_heading, font_body, etc.).

2. **Background gradient** — replace the hardcoded `from-[hsl(222,47%,11%)] to-[hsl(215,70%,25%)]` with the tenant's `primary_color` and `secondary_color` via inline `style` when on a tenant portal (keep the default gradient for platform `/auth`).

3. **Sign In button** — apply `primary_color` as the button's background via inline style so it matches the tenant brand.

4. **Logo container** — enlarge slightly and remove the rounded background so the logo displays more prominently against the card.

5. **Favicon** — when `branding.favicon_url` is set, dynamically update `document.querySelector('link[rel="icon"]')` via a `useEffect` so the browser tab shows the tenant's favicon on the login page.

6. **Fonts** — if `font_heading` or `font_body` are set, apply them to the card title and inputs via inline `fontFamily`.

No database or edge function changes required — all branding data is already available via the existing `useTenantBranding` hook and public RLS policy.
