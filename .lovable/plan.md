## Issue 1: Demo Banner Showing on Tenant Portals

The `DemoBanner` in `CustomerLayout.tsx` displays whenever the logged-in user's `profiles.is_demo` is `true`. This is wrong for real tenant portals -- demo mode is a platform concern, not a tenant portal concern.

**Fix**: Remove the demo banner entirely from `CustomerLayout.tsx` (the tenant customer layout). Demo banners belong only in the platform/Try experience, not on tenant storefronts. Remove the `DemoBanner` component, the `is_demo` profile query, and the conditional render.

### Files changed
- `src/components/CustomerLayout.tsx` -- Remove `DemoBanner` component definition, remove `useQuery` for `profile_demo_flag`, remove `isDemo` variable, remove `{isDemo && <DemoBanner .../>}` render. Clean up unused imports (`Sparkles`, `X` if no longer used, the profile query).

---

## Issue 2: Logo Upload in Branding Settings

Currently the branding tab only has a text input for "Logo URL". Admins need to upload an image file directly.

**Fix**: Add a file upload button next to the Logo URL input. When a file is selected, upload it to Supabase Storage (using the existing `s3-storage` edge function pattern or direct Supabase storage) under a tenant-scoped path like `tenant-assets/{tenantId}/logo.{ext}`. On success, set the `logoUrl` state to the resulting public/signed URL.

### Files changed
- `src/pages/admin/settings/BrandingTab.tsx`:
  - Add a hidden `<input type="file" accept="image/*">` and an "Upload" button next to the Logo URL input
  - On file select, upload via `supabase.storage.from('tenant-assets').upload(...)` (or via `s3-storage` edge function)
  - Set `logoUrl` to the public URL of the uploaded file
  - Show upload progress/loading state
  - Same treatment for Hero Image if desired

- **Migration** (if `tenant-assets` bucket doesn't exist): Create a Supabase storage bucket `tenant-assets` with appropriate RLS policies allowing tenant admins to upload.
