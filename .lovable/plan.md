

### Root cause

When you click "Sign In", `useAuth.loading` is already `false` (from the initial `getSession()` call returning no session). When `onAuthStateChange` fires `SIGNED_IN`:

1. `setUser(session.user)` runs immediately
2. `fetchRoles` is deferred to `setTimeout(0)` 
3. **`loading` stays `false` the whole time**

So `Auth.tsx`'s effect runs with `user=truthy, authLoading=false, highestRole=null` and navigates to `getDefaultRoute(null)` = `/dashboard` → `StorefrontRedirect` → `/t/printworx/dashboard`.

My previous "fix" gating on `!authLoading` was a no-op because `authLoading` was never set back to `true` for the sign-in flow.

### Fix

**`src/hooks/useAuth.tsx`** — when `onAuthStateChange` fires `SIGNED_IN` (or `TOKEN_REFRESHED` with a new user), set `loading=true` BEFORE the deferred role fetch, so consumers reliably wait for roles to populate. Reset to `false` only after roles are set.

```text
onAuthStateChange((event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
  if (session?.user) {
    setLoading(true);              // ← ADD THIS
    setTimeout(async () => {
      const userRoles = await fetchRoles(session.user.id);
      setRoles(userRoles);
      setLoading(false);
    }, 0);
  } else {
    setRoles([]);
    setLoading(false);
  }
});
```

That single line closes the race. `Auth.tsx`'s existing guard (`!authLoading`) will then correctly wait for roles before deciding the destination, and `getDefaultRoute('platform_admin')` will send you to `/platform`.

### Files touched
- `src/hooks/useAuth.tsx` — add `setLoading(true)` before the deferred role fetch in `onAuthStateChange`.

No other changes needed. The Auth.tsx logic is already correct once `authLoading` behaves properly.

