
## What’s actually happening

This is not the browser doing a real page reload, and it’s not React Query window-focus refetching either.

I can see from your code and logs that when you return to the tab, Supabase auto-refreshes the auth token:

- network log shows `POST /auth/v1/token?grant_type=refresh_token`
- immediately after that, the app re-runs:
  - `user_roles` fetch
  - `tenant_memberships` fetch
  - tenant lookup fetches
- your route guards then show the full-screen `Loading...` overlay, which makes it feel like the whole app refreshed

## Root cause

There are two code-level causes working together:

1. `useAuth` treats every auth event like a fresh app bootstrap  
   In `src/hooks/useAuth.tsx`, `onAuthStateChange(...)` does this for any session event:
   - `setSession(session)`
   - `setUser(session?.user ?? null)`
   - `setLoading(true)`
   - re-fetch roles

   That includes background token refresh events when the tab regains focus.

2. `useTenantContext` reloads memberships whenever the `user` object changes  
   In `src/hooks/useTenantContext.tsx`, the effect depends on `[user]`, not a stable key like `user?.id`.  
   When Supabase refreshes the token, the session/user object can change identity even though it’s still the same signed-in person. That retriggers:
   - `setLoading(true)`
   - `tenant_memberships` query
   - tenant name lookup

Then `ProtectedRoute` blocks the entire app whenever either auth or tenant context is loading:

- `src/components/ProtectedRoute.tsx`
- if `loading || tenantLoading`, it renders the full-screen spinner

So the app “blanks out” on focus.

## Why this has been happening in newer builds

The pattern causing this is:

- modern auth SDKs silently refresh tokens when a tab becomes active again
- if app code uses one shared `loading` flag for both:
  - initial app bootstrap
  - background auth/session maintenance
- then every silent token refresh looks like a fresh app load

That’s why you’re seeing it more recently. It’s not a browser bug and not something inherent to Lovable-hosted apps; it’s an app-state design issue in the auth/context layer.

## What I’ll change

### 1) Split “initialising app” from “background auth updates”
Refactor `useAuth` so it has a bootstrap-only loading state.

New behavior:
- on first mount:
  - call `getSession()`
  - fetch roles once
  - mark auth as ready
- on `onAuthStateChange`:
  - update session/user silently
  - only re-fetch roles when actually needed
    - signed in as a different user
    - signed out
    - explicit sign-in/signup callback flow
  - do not set the global blocking loader for token refresh events

In practice:
- `TOKEN_REFRESHED` should not trigger full-screen loading
- same-user session refresh should be silent

### 2) Make tenant loading depend on `user?.id`, not whole `user`
Refactor `useTenantContext` effect dependency from `[user]` to something stable like `[user?.id]`.

New behavior:
- if the same user remains signed in, background token refresh won’t reload memberships
- memberships stay in memory
- tenant context does not flicker back to loading

### 3) Preserve existing tenant data during silent refresh
Keep current memberships/tenant state while background auth events happen.

That means:
- no `setLoading(true)` for same-user silent refreshes
- only show blocking load when:
  - app first boots
  - user actually changes
  - user signs out

### 4) Tighten route guard behavior
Update `ProtectedRoute` and entry redirects so they only block on true initial unresolved auth/tenant bootstrap.

Goal:
- first load: spinner is fine
- tab refocus: no full-screen spinner
- explicit login/logout: still correct

### 5) Leave React Query settings alone
`src/App.tsx` already has:

- `refetchOnWindowFocus: false`
- `refetchOnReconnect: false`

So I will not chase React Query here. That’s not the problem.

## Extra issue spotted
There’s also a console warning in `EmailAccountsTab` / `DialogContent` about refs being passed to a function component. That’s separate from the refresh issue, but I’ll clean it up while I’m in there if you want. It’s not the cause of the tab-focus refresh.

## Implementation plan

1. Refactor `useAuth` to distinguish:
   - initial bootstrap loading
   - background auth/session updates
2. Ignore or handle `TOKEN_REFRESHED` without setting blocking `loading = true`
3. Change `useTenantContext` to key membership loading off `user?.id`
4. Prevent tenant context from re-entering loading state on same-user token refresh
5. Verify `ProtectedRoute` and `AppEntryRedirect` only block on first-load conditions
6. Test by:
   - opening `/admin/settings?tenant=...`
   - switching away from the tab and back
   - confirming there is no full-screen loading reset
   - confirming login/logout still behave correctly
   - confirming tenant override still persists

## Technical details

```text
Current flow on tab focus
browser focus
  -> Supabase refresh token
  -> onAuthStateChange fires
  -> useAuth sets loading=true
  -> setUser(new object reference)
  -> useTenantContext effect runs again
  -> tenantLoading=true
  -> ProtectedRoute shows fullscreen loader
```

```text
Desired flow on tab focus
browser focus
  -> Supabase refresh token
  -> useAuth updates session silently
  -> same user id, no bootstrap loading
  -> useTenantContext does not reload memberships
  -> current screen stays visible
```

## Expected outcome after fix

- coming back to the tab will feel instant
- no fake “app refresh” overlay
- background auth refresh still works properly
- tenant/admin pages stay stable
- only real app startup or real auth changes show a blocking loader
