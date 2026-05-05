
## Issues and Fixes

### 1. Tenant Logo Not Visible in Top Left

**Problem**: The header checks `branding?.logo_url || tenant?.logo_url` but PostNET's logo_url in `tenant_settings` (branding category) may be empty, and `tenants.logo_url` may also be null. There's no fallback to the scraped facsimile header which might contain the logo.

**Fix** in `CustomerHeader.tsx`:
- When `branding?.facsimile_enabled` is true and no explicit `logo_url` is set, attempt to extract the logo from `branding.header_html` (the scraped header contains tenant branding).
- As a secondary improvement, ensure the admin Tenant Settings page allows uploading a logo directly (the field currently only accepts a URL). This is a future enhancement — for now, we ensure the header falls back gracefully to the portal name text when no logo is available.

### 2. Sidebar Blue Flash Before Tenant CSS Loads

**Problem**: The `.print-sidebar` background uses `hsl(var(--tenant-primary, ...))` CSS variables. These are injected by `CustomerLayout` via `tenantStyle` only after the branding query resolves. Until then, the sidebar renders with the default `--sidebar-background` (blue-ish from the base theme).

**Fix** in `CustomerLayout.tsx`:
- While `branding` is still loading (the query is in-flight), hide the sidebar or apply a neutral/transparent background to avoid the blue flash.
- Concretely: check `useTenantBranding` loading state and render the sidebar only once branding has resolved, or apply `opacity-0` / `invisible` during the loading phase with a quick fade-in transition.

### 3. Footer Terms/Privacy Links Point to Document Centre Content

**Problem**: The footer links to `/t/{slug}/terms` and `/t/{slug}/privacy` which render Document Centre placeholder content. The "Powered by Document Centre" link is fine for white-label, but the Terms/Privacy shouldn't imply Document Centre policies.

**Fix** in `CustomerFooter.tsx`:
- Check tenant settings for custom `terms_url` and `privacy_url` values. If the tenant has configured external URLs for these, link to those instead.
- If no custom URLs exist, either hide the links entirely or keep them pointing to the placeholder pages (which already say "Terms for {tenant name} are coming soon").
- The "Powered by Document Centre" link stays as-is (it's already hidden for demo tenants).

### 4. Google OAuth Redirects to document-centre.com Instead of Back to Cart

**Problem**: Two issues combine here:

(a) **Supabase redirect URL whitelist**: The `redirectTo` in `SocialAuthButtons` uses `window.location.origin` to build `/auth/callback?tenant=postnet`. However, if the user is on a Lovable preview domain or custom domain that isn't in Supabase's "Redirect URLs" whitelist, Supabase silently falls back to the **Site URL** (document-centre.com).

(b) **No cart return path**: Even when the redirect works correctly, `AuthCallback` sends customers to `/t/{slug}/print-centre` (via `resolveTenantLanding`). It doesn't know the user was in the cart/checkout flow.

**Fix**:
- In `SocialAuthButtons.tsx` / `CheckoutAuth.tsx`: before redirecting to Google, save the current path (e.g. `/t/postnet/checkout`) to `localStorage` as `dc_return_path`.
- In `AuthCallback.tsx`: after successful tenant-scoped customer login, check `localStorage` for `dc_return_path`. If present, navigate there instead of the default `resolveTenantLanding` route. Clear after use.
- **User action required**: Add the Lovable preview domain and any custom tenant domains to Supabase's Authentication > URL Configuration > Redirect URLs. Without this, Supabase will keep redirecting to the Site URL regardless of what code we set.

---

## Technical Changes

| File | Change |
|------|--------|
| `src/components/CustomerLayout.tsx` | Gate sidebar visibility on branding loaded state; add fade-in transition |
| `src/components/CustomerHeader.tsx` | Fallback logo extraction from facsimile `header_html` when no explicit logo_url |
| `src/components/CustomerFooter.tsx` | Fetch `terms_url` / `privacy_url` from tenant settings; conditionally hide or link externally |
| `src/components/auth/SocialAuthButtons.tsx` | Save `dc_return_path = window.location.pathname` to localStorage before OAuth |
| `src/components/checkout/CheckoutAuth.tsx` | Same return path save (belt-and-braces) |
| `src/pages/AuthCallback.tsx` | After tenant customer login, prefer `dc_return_path` over `resolveTenantLanding` default |

### User Action Required
- **Supabase Dashboard**: Add all domains where tenants access the portal to Authentication > URL Configuration > Redirect URLs (e.g. `https://id-preview--*.lovable.app/**`, `https://document-centre.jaimar.dev/**`, production custom domains).
