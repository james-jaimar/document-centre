

**Three fixes for the platform shell:**

### 1. Rebrand sidebar header
`src/components/AppSidebar.tsx` line 128–131 — replace hardcoded `"PrintHub Platform"` / `"PrintHub"` fallback with `"Document Centre"`. Subtitle stays "Platform Admin" / role.

### 2. Fix footer role label
Same file, line 222 — currently shows `roles[0] ?? "user"` which picks an arbitrary role (so a platform admin who also has the legacy `customer` role displays as "customer"). Change to display the **highest role** with a friendly label:
- `platform_admin` → "Platform Admin"
- `head_office_admin` → "Tenant Admin"
- `branch_manager` → "Branch Manager"
- `store_operator` → "Store Operator"
- `customer` → "Customer"

Use `highestRole` from `useAuth()` (already exposed).

### 3. Scope Platform Users to platform staff only + add CRUD
This is the meat. Currently `usePlatformUsers` returns **every profile in the database** including tenant customers — that's why `james_b_hawkins` (a PostNet customer) shows up. Platform Users should be the SaaS operator team only.

**Filter logic** — update `src/hooks/usePlatformUsers.ts` to only return profiles where:
```
EXISTS (SELECT 1 FROM user_roles WHERE user_id = profiles.id AND role = 'platform_admin')
```
Tenant memberships are still shown as informational badges (so you can see if a platform admin also has tenant access), but tenant-only users are excluded entirely.

**CRUD operations** — extend `src/pages/platform/PlatformUsers.tsx`:
- **Invite Platform Admin button** (top right) → opens dialog asking for email + display name. Calls a new `invite-platform-admin` edge function that:
  - Sends a magic-link/invite email via the existing `send-email` function
  - On first sign-in, the `handle_new_user` trigger creates the profile; we then need to assign `platform_admin` via `user_roles`. Simplest: the edge function (service role) pre-creates the auth user with `email_confirm: false` and inserts a `user_roles` row with role `platform_admin` keyed to the new auth user id.
- **Revoke admin** action in row dropdown → removes the `platform_admin` row from `user_roles` (account stays, just loses platform access). Hidden for the current user (can't self-revoke).
- Existing **Force password reset / Disable / Enable / Delete** stay as-is (they already use `manage-user`).
- Add a small "Platform Admin" badge column or merge into Status (e.g., Status pill stays Active/Disabled, plus a separate "Role" cell showing "Platform Admin").

**Self-listing** — once the filter is in place, the current user (if a platform admin) will appear in the list. The current screenshot user isn't a platform admin in the DB (`james_b_hawkins` only has `customer`) — but `admin@printworx.co.za` (James Hawkins) IS a platform admin and will continue to appear correctly.

### Files touched
- `src/components/AppSidebar.tsx` — brand string + footer role label
- `src/hooks/usePlatformUsers.ts` — filter to platform admins only
- `src/pages/platform/PlatformUsers.tsx` — Invite button, dialog, revoke action, role column
- `src/components/platform/InvitePlatformAdminDialog.tsx` — new component
- `src/hooks/useInvitePlatformAdmin.ts` — new mutation hook
- `supabase/functions/invite-platform-admin/index.ts` — new edge function (service-role, creates auth user + user_roles row, sends invite email)
- `supabase/functions/manage-user/index.ts` — extend with `revoke_platform_admin` action
- `supabase/config.toml` — register the new function

### Security notes
- New edge function gated by `supabase.auth.getUser()` + check caller has `platform_admin` role before performing any action.
- Revoke-admin is blocked if the target is the only remaining platform admin (prevent lockout).

