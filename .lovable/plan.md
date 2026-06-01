# Tenant-branded favicon & title for store admin

Right now the customer storefront (`CustomerLayout`) and tenant auth page already swap the favicon to `branding.favicon_url`, but the **branch admin** (`/branch/*`) and **tenant admin** (`/admin/*`) portals keep the default Document Centre favicon + "Document Centre — Web-to-Print SaaS" tab title. When a PostNet branch user is logged in, the browser tab still reads like our SaaS, not their store.

## Changes

1. **New hook `src/hooks/useDocumentBranding.ts`**
   - Inputs: `tenantId`, optional `suffix` (e.g. `"Admin"`, `"Branch Portal"`).
   - Reads `useTenantBranding(tenantId)` to get `favicon_url` and `portal_name`; falls back to `tenantName` from `useTenantContext`.
   - On mount / change:
     - Sets `document.title` to `` `${portal_name || tenantName} — ${suffix}` `` (skips if no tenant resolved).
     - Updates `<link rel="icon">` href to `favicon_url` when present.
   - On unmount: restores the original title + favicon (same pattern as `CustomerLayout`).

2. **Wire it into the two admin layouts**
   - `src/components/AppLayout.tsx` — used by `/admin/*` routes. Call `useDocumentBranding(tenantId, "Admin")`.
   - `src/components/BranchLayout.tsx` — used by `/branch/*` routes. Call `useDocumentBranding(tenantId, "Branch Portal")`.
   - Both pull `tenantId` from `useTenantContext()`.

3. **Leave untouched**
   - `index.html` static defaults (used on platform `/platform/*`, marketing, and pre-tenant loading).
   - `CustomerLayout` and `Auth.tsx` already self-manage favicon — refactor them to use the new hook as a follow-up only if trivial; not required for this change.

## Result

- PostNet branch user on `/branch/orders` → tab shows `PostNet Print Centre — Branch Portal` with the PostNet favicon.
- Tenant owner on `/admin/settings` → tab shows `PostNet Print Centre — Admin` with the PostNet favicon.
- Platform admin on `/platform/*` → unchanged Document Centre branding.

## Out of scope

Auth flow, routing, branding data model, storefront pages, platform pages, og/meta tags.
