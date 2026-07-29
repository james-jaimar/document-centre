## Fix: hero image upload fails with "invalid input syntax for type uuid: '_master'"

### Root cause (confirmed)
`HeroImageUpload` in `src/components/admin/ProductFamilyForm.tsx` uploads master product hero images to the `tenant-assets` bucket under the path `_master/products/…`. That bucket's RLS policy casts the first path segment to `uuid`:

```
user_is_tenant_admin(((storage.foldername(name))[1])::uuid)
```

`_master` isn't a UUID, so the cast throws before any permission check can pass — hence the toast. This only affects **master-catalogue** uploads (Platform Admin → New Product / Edit Product). Tenant-scoped uploads work because they use a real tenant UUID as the first segment.

### Fix
Create a dedicated public bucket `product-assets` for master + tenant product hero images and point `HeroImageUpload` at it. This avoids fighting the tenant-assets policy structure and keeps product imagery cleanly separated.

**Steps**
1. Create bucket `product-assets` (public) via `supabase--storage_create_bucket`.
2. Migration: add RLS policies on `storage.objects` for that bucket:
   - Public `SELECT` (it's a public bucket).
   - `INSERT/UPDATE/DELETE` restricted to `platform_admin` OR any authenticated user with a tenant membership (owner/admin) — matches who can currently reach the product editors.
   - No UUID cast on the path; use a simple `_master/…` or `<tenant_id>/…` convention as a folder hint only.
3. Update `HeroImageUpload` in `src/components/admin/ProductFamilyForm.tsx`:
   - Change bucket from `tenant-assets` to `product-assets`.
   - Path: `master/<slug>-<timestamp>.<ext>` for master rows (drop the leading underscore for cleanliness) and `tenants/<tenant_id>/<slug>-<timestamp>.<ext>` when a tenant id is available (optional — pass through as a prop later if needed; not required for this fix).
4. Leave existing `tenant-assets` uploads alone.

### Technical notes
- Bucket is public so `getPublicUrl()` keeps working with no signed-URL plumbing.
- Old master hero images already stored in `tenant-assets/_master/…` will keep resolving (the SELECT policy allows public reads), so no data migration needed.
- No changes to `NewProductWizard` — it only consumes `HeroImageUpload`.

### Out of scope
- The unrelated `invalid_master` toast on the products list (visible in the screenshot) — that's a separate query passing `"_master"` as a UUID somewhere else and should be fixed in a follow-up if it persists after this change.
