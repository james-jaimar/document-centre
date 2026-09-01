# Keep artwork templates inside a single tenant

## What I checked

- Every existing row in `artwork_templates` already has `scope_type = 'tenant'` and a real `tenant_id` (one calendar template on tenant `238a…`, seven deskpad templates on tenant `0befd2c2…`). So nothing is being written to the wrong tenant — the stored data is clean.
- The crossover is on **reading**. `useArtworkTemplates` and `useArtworkPlaceholders` query only by `product_family_id` / `template_id` with **no tenant filter**, so the query returns whatever row-level security lets the current user see.
- The current read policy on `artwork_templates` lets a user see a template if any of these is true: it is a published master template; it is published and matches the storefront tenant header; **the user is a platform admin**; or the user has any active membership of the owning tenant.
- Result: a platform admin (and anyone who is a member of more than one tenant) opens the Templates tab for a product inside Tenant A and sees, selects and edits templates belonging to Tenant B, because the screen never says which tenant it wants.

## Fix

1. **Make template queries tenant-explicit.**
   - `useArtworkTemplates` takes the tenant (and branch, where relevant) it is being used in and filters on it, rather than trusting the policy to narrow results.
   - Admin usage passes the tenant currently being administered; the customer builder passes the resolved storefront tenant.
   - Master-scope templates are only included where that is genuinely intended (platform-level editing), never mixed into a tenant's list by accident.

2. **Scope placeholders to their parent template's tenant** so a placeholder set can never be loaded through a template the caller isn't scoped to.

3. **Guard writes at the screen.** The Templates tab refuses to create, save, publish or delete when the selected template's `tenant_id` doesn't match the tenant being administered, so a stale selection can't write into another tenant.

4. **Tighten the read policy** so cross-tenant visibility requires an explicit platform context instead of being the default for platform admins: a template is readable when it is master scope, when it matches the storefront tenant header, or when the caller has an active membership of that exact tenant. Platform admins keep full access only through the platform screens, which pass a tenant explicitly.

5. **Verify**: as the 2027 Edition tenant, open the calendar product's Templates tab and confirm only that tenant's template is listed; as the deskpad tenant, confirm only its seven layouts appear; confirm each storefront lists only its own published templates and that an unauthenticated visitor on one storefront cannot fetch the other tenant's template or its placeholder rows.

## Technical notes

- Change: `src/hooks/useArtworkTemplates.ts` (tenant-aware query keys and filters), `src/components/admin/ArtworkTemplatesTab.tsx` (pass and assert `tenantId`), `src/pages/dashboard/TemplatedArtworkBuilder.tsx` (pass the storefront tenant).
- The policy change is a migration replacing `artwork_templates_read` and `artwork_placeholders_read`; no schema/grant changes are needed since the tables already exist with grants.
- No data migration required — existing rows are correctly owned.
