## Two fixes for Platform Communications

### 1. "Dry run failed / CORS" — function isn't deployed

`send-branch-welcome-campaign` is missing from `supabase/config.toml`, so Supabase never deploys it. The browser hits a non-existent endpoint, gets no CORS headers back, and shows "Failed to send a request to the Edge Function / blocked by CORS".

**Fix:** Register the function in `supabase/config.toml` under `[functions]` with `verify_jwt = false` (matches the pattern of every other admin-callable function in this project; auth is enforced inside the function via `getUser()` + `user_roles` check).

### 2. Custom domain not being used for store URL / action link

`tenants.custom_domain` is already populated (e.g. `postnetprintcenter.com`) and used by `send-order-email`, but the Communications flow ignores it. Currently `resolveAppOrigin` only checks `tenant_settings.branding.portal_url` → global `app_url` → caller origin. The campaign also prefixes `/t/<slug>` to the store URL, which is wrong when the tenant has its own domain.

**Fix — backend (`supabase/functions/_shared/buildAuthLink.ts`):**
- In `resolveAppOrigin`, before checking `portal_url`, look up `tenants.custom_domain` for the given `tenantId`. If set, return `https://<custom_domain>` as the origin.
- Return a small flag (or a second helper) so callers know the origin is a tenant-owned domain and should NOT prepend `/t/<slug>` for paths.

**Fix — campaign (`supabase/functions/send-branch-welcome-campaign/index.ts`):**
- When the resolved origin came from `custom_domain`, build:
  - `store_url` = `https://<custom_domain>/<branch_slug>` (no `/t/<tenant_slug>` prefix)
  - `action_link` = same origin, no `/t/<slug>` prefix passed to `buildAppVerifyLink`
- Otherwise keep the existing `/t/<slug>` behaviour for platform-hosted tenants.

**Fix — UI preview (`src/pages/platform/PlatformCommunications.tsx`):**
- When the selected tenant has `custom_domain`, render the preview's `store_url` as `https://<custom_domain>` (no `/t/<slug>`), so the preview matches what recipients will actually see.
- This requires reading `custom_domain` alongside the tenant in the existing tenants query.

### Files to edit
- `supabase/config.toml` — register `send-branch-welcome-campaign`
- `supabase/functions/_shared/buildAuthLink.ts` — custom-domain lookup + tenant-owned-origin signal
- `supabase/functions/send-branch-welcome-campaign/index.ts` — use signal to drop `/t/<slug>` prefix
- `src/pages/platform/PlatformCommunications.tsx` — preview uses custom domain when set

No DB migrations, no UI restructure. After this, "Dry run" will execute and the preview/email links will read `https://postnetprintcenter.com/...` for PostNet.
