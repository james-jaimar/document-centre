## Tenant Favicon Support

### What changes

1. **Branding Tab** (`src/pages/admin/settings/BrandingTab.tsx`)
   - Add a `favicon_url` state field, loaded from `settingsMap.favicon_url`
   - Add an `ImageUploadField` for "Favicon" in the Images card (accepts .ico, .png, .svg), using `fileKey="favicon"` so it uploads to `tenant-assets/{tenantId}/favicon.{ext}`
   - Include `favicon_url` in the `handleSave` bulk upsert

2. **Tenant Branding hook** (`src/hooks/useTenantBranding.ts`)
   - Add `favicon_url: string` to the `TenantBranding` interface with default `""`

3. **Customer Layout** (`src/components/CustomerLayout.tsx`)
   - Once branding is loaded, if `branding.favicon_url` is set, dynamically update `document.querySelector('link[rel="icon"]')` href to the tenant's favicon URL via a `useEffect`
   - On unmount (or when leaving the tenant portal), restore the default `/favicon.svg`

### No database migration needed
`favicon_url` is stored as a `tenant_settings` row (category=branding, key=favicon_url) — same pattern as all other branding fields.
