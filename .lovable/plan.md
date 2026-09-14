# White logo for dark backgrounds

The activation page shows the tenant's standard logo on a dark navy header band, so a dark logo disappears — which is what's happening for The 2027 Edition.

## What changes

1. **New branding option: "Logo for dark backgrounds"**
   In Tenant Admin → Settings → Branding, next to the existing logo fields, add an upload/URL field for a white/reversed version of the logo, with a small dark preview swatch so you can check it reads properly.

2. **Activation page uses it**
   The activation page header uses the white logo when one is set, and falls back to the normal logo when it isn't — so nothing changes for tenants that don't set one.

3. **Upload your white logo for The 2027 Edition**
   The attached white horizontal logo gets uploaded and set as that tenant's dark-background logo, so the activation page is fixed straight away.

Other places with dark bands (emails, portal header) keep using their current logo settings; we can switch them over later if you want.

## Technical notes

- New `tenant_settings` entry: category `branding`, key `logo_light_url` (string), saved alongside `logo_url` / `email_logo_url` in `src/pages/admin/settings/BrandingTab.tsx` using the same upload helper.
- `supabase/functions/get-activation-page/index.ts` reads `brandMap.logo_light_url` and returns it as `tenant_logo_light_url`; redeploy the function.
- `src/pages/Activate.tsx` prefers `tenant_logo_light_url`, falls back to `tenant_logo_url`, then the text name.
- Upload the supplied PNG to the tenant branding asset location and write the resulting URL into `logo_light_url` for tenant `238a6748-a1a3-42f4-b88c-6ac44b316780`.
