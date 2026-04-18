

## Why "Invalid Link" appears

The new `/auth/verify` page correctly exchanges the token and creates a Supabase session. It then navigates to `/reset-password`. But `ResetPassword.tsx` only flips `isRecovery = true` when `window.location.hash` contains `type=recovery` — that hash existed in the *old* Supabase-hosted flow (`#access_token=...&type=recovery`), but our new app-hosted flow uses `verifyOtp({ token_hash, type })` which establishes the session via API and leaves the URL hash empty. So the gate fails and the user sees "Invalid Link".

The token verification itself worked (no error from AuthVerify). The user is actually signed in — they just can't get past the gate.

## The fix

Two small client-side changes — no edge function, no DB.

**`src/pages/AuthVerify.tsx`**
- After `verifyOtp` succeeds, navigate to `${next}?recovery=1` so ResetPassword has an unambiguous signal.

**`src/pages/ResetPassword.tsx`**
- Treat the page as a valid recovery context when ANY of these is true:
  1. `?recovery=1` (new app-hosted flow)
  2. `#type=recovery` (legacy Supabase hash flow — keep for safety)
  3. There's an active Supabase session AND the URL came from `/auth/verify` (sanity fallback)
- Show a small loading state while checking, instead of flashing "Invalid Link".
- Keep the existing form and `updateUser({ password })` call — they're correct.

**Optional safety polish** (recommended): after a successful password update, call `supabase.auth.signOut()` then navigate to `/auth` so the user re-authenticates with the new password. This avoids a freshly-invited user landing in the app with an unfamiliar tenant context attached.

### Files

| File | Change |
|---|---|
| `src/pages/AuthVerify.tsx` | Append `?recovery=1` to `next` on success |
| `src/pages/ResetPassword.tsx` | Detect recovery via query param OR legacy hash OR active session; drop the false "Invalid Link" |

### Why this is safe

- The token has already been verified by AuthVerify before redirect, so the recovery gate isn't a security boundary — it's just UX.
- The actual security check is `supabase.auth.updateUser({ password })`, which requires an authenticated session. If a random visitor hits `/reset-password?recovery=1` with no session, `updateUser` will fail with an auth error (which we'll surface).

