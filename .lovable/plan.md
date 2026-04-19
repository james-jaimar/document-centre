

## Root cause — sign-in loop

There's a **race condition** in `src/pages/Auth.tsx` between role loading and the gating effect.

When James (who is BOTH `platform_admin` AND `owner` of `printworx`) signs in on `/auth`:

1. `signInWithPassword` resolves → `useAuth` sets `user` immediately, but schedules `fetchRoles` via `setTimeout`
2. Auth.tsx gating effect runs — but `roles` is still `[]` so `highestRole === null`
3. The check `if (highestRole === "platform_admin")` (line 42) is FALSE → falls through
4. `isTenantPortal === false` → fetches memberships → finds printworx → **signs out and bounces to `/t/printworx/auth?email=...` with the "Please sign in via your organisation's portal" toast**
5. On `/t/printworx/auth` he signs in again; same race can repeat — and even when it succeeds the gating may bounce him to `/platform` while he's actually trying to enter the storefront
6. Loop

Same race exists in `src/pages/AuthCallback.tsx` (Google OAuth path) — it does its own role lookup but only after the session is set, with the same single source of truth issue if the user has both platform and tenant roles.

The toast in the screenshot ("Please sign in via your organisation's portal") is literally that bounce firing.

## What I'll change

### 1. Wait for roles before deciding (fixes the race)

In `Auth.tsx`, add a derived "auth fully ready" gate:

- block the gating effect until either `roles.length > 0` OR we've definitively confirmed there are no roles
- expose a `rolesLoaded` flag from `useAuth` (separate from the bootstrap `loading`) so `Auth.tsx`, `AuthCallback.tsx` and `AppEntryRedirect.tsx` can wait on it without flipping the global loading spinner

Concretely in `useAuth.tsx`:
- add `rolesLoaded: boolean` to the context
- set it to `true` after the initial `fetchRoles` resolves on bootstrap
- set it to `false` whenever `currentUserIdRef` changes (new user identity), then back to `true` once that user's roles resolve
- `TOKEN_REFRESHED` for the same user does NOT touch this flag

### 2. Decide based on full role+membership picture

In `Auth.tsx` gating, change the order of decisions to:

1. If `!rolesLoaded` → return (wait)
2. If `highestRole === "platform_admin"`:
   - On `/t/:slug/auth` → navigate to `/t/:slug/dashboard` (platform admins are allowed into any storefront they want to inspect; do NOT force them to `/platform` from a tenant URL — the user clearly wants to be in the tenant context)
   - On generic `/auth` → navigate to `/platform`
3. Otherwise, run the existing tenant-membership branch

This means a user like James who has both roles can sign into the storefront at `/t/printworx/auth` and stay in the storefront, AND can sign into `/auth` and land on the platform. No loop.

### 3. Mirror the same fix in `AuthCallback.tsx`

The OAuth callback path has the same "bounce tenant member to their portal" logic and the same toast. Apply the same rule:
- platform admin entering via `/t/:slug/auth/callback` → land on `/t/:slug/dashboard`
- platform admin entering via `/auth/callback` → land on `/platform`
- non-platform user entering via `/auth/callback` who has a tenant membership → still bounce to their tenant portal (this is the only case that should ever show the bounce toast)

### 4. Don't sign the user out on a "wrong door" bounce when they're a platform admin

Today, the generic `/auth` bounce calls `supabase.auth.signOut()` before redirecting. For platform admins this is wrong — they have a valid session and should keep it. After fix #2 they won't hit this branch at all, but as a safety net I'll guard the signOut with `if (highestRole !== "platform_admin")`.

### 5. Verification

1. Sign out fully. Visit `/auth`. Sign in as `james@jaimar.dev`.
   - Expected: lands on `/platform`. No bounce toast. No loop.
2. Sign out fully. Visit `/t/printworx/auth`. Sign in as `james@jaimar.dev`.
   - Expected: lands on `/t/printworx/dashboard`. No bounce toast. No loop.
3. Sign out fully. Visit `/t/postnet/auth`. Sign in as `hello@jaimar.dev` (tenant admin only, no platform role).
   - Expected: lands on `/t/postnet/dashboard`. No bounce.
4. Sign out fully. Visit `/auth`. Sign in as `hello@jaimar.dev`.
   - Expected: bounce toast appears, redirected to `/t/postnet/auth?email=...` (this case is intentional — the user is at the wrong door and they're not a platform admin).

## Files to change

- `src/hooks/useAuth.tsx` — add `rolesLoaded` flag
- `src/pages/Auth.tsx` — wait for `rolesLoaded`; reorder platform-admin decision; per-portal landing
- `src/pages/AuthCallback.tsx` — same per-portal landing for platform admins; same wait-for-roles pattern
- `src/components/AppEntryRedirect.tsx` — also wait on `rolesLoaded` to avoid a flash redirect with stale roles

No DB changes. No new RLS. No edge function changes.

