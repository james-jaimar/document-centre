# Tenant-controlled browser tab title

## What's happening now

- Customer storefront pages never change the browser tab text, so every tenant page shows the static `Document Centre — Web-to-Print SaaS` title from `index.html`.
- The tenant favicon *is* already swapped on customer pages, so the tab shows the tenant icon next to Document Centre wording — the mismatch in the screenshot.
- Admin/branch portals do change the title (via the existing document-branding hook) using the portal name, but there is no dedicated setting the tenant admin can type.

## What to build

1. **Two new fields in Admin → Settings → Branding** (next to Favicon):
   - **Browser tab title** — what shows in the tab, e.g. `Impress Print — Order Prints Online`. Left blank, it falls back to the portal name (or tenant name).
   - **Meta description** — short SEO/social description. Blank falls back to the existing tagline.
   Both saved as tenant branding settings, same save button as the rest of the tab.

2. **Apply them on all customer-facing tenant pages**: the tab title, the meta description tag, and the og/twitter title+description are set from tenant branding while the customer is inside a tenant portal, and restored to the Document Centre defaults elsewhere.

3. **Keep admin/branch portals consistent**: they use the same new title as the base, still suffixed with `Admin` / `Branch Portal`.

4. Unread-message counter prefix behaviour (`(3) Title`) keeps working on top of the branded title.

## Technical notes

- New branding keys `browser_title` and `meta_description` in the `branding` category of `tenant_settings`; add them to the `TenantBranding` interface/defaults in `useTenantBranding.ts` and bump the branding localStorage cache prefix to `v3` so cached snapshots pick up the new keys.
- Extend `useDocumentBranding.ts` to also manage `<meta name="description">`, `og:title`, `og:description`, `twitter:title`, `twitter:description`, with cleanup restoring originals on unmount; title resolution order: `browser_title` → `portal_name` → tenant name.
- Call the hook from `CustomerLayout.tsx` (and the mobile layout wrapper if it renders separately) with no suffix; the existing inline favicon effect there can be dropped in favour of the hook's favicon handling.
- Edits to `BrandingTab.tsx`: two `Input` fields plus the matching entries in the `bulkUpsert` array and the load `useEffect`.
- No database migration required — `tenant_settings` already stores arbitrary branding keys.
