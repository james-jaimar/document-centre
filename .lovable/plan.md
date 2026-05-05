
## Issues and Fixes

### 1. Google consent screen shows Document Centre branding

This is configured in **Google Cloud Console**, not in code. The app name, logo, and support email shown on the Google sign-in screen come from your OAuth consent screen settings.

**Action required (manual, in Google Cloud Console):**
- Go to APIs & Credentials > OAuth consent screen
- Update the app name, logo, and support email to match what you want users to see (or make it generic/neutral)
- Note: Google only allows one consent screen per project. If you need per-tenant branding on the Google screen, you'd need separate Google Cloud projects per tenant (not practical). The standard approach is to use a neutral/platform-level brand here.

No code changes for this item.

### 2. "Completing sign-in..." interstitial on `/auth/callback`

Currently `AuthCallback.tsx` shows a branded card with a spinner and "Completing sign-in..." text on a dark blue background. For tenant OAuth flows this feels disjointed.

**Fix in `src/pages/AuthCallback.tsx`:**
- Make the loading state minimal and fast — just a centered spinner with no card/background chrome, or a transparent overlay
- Reduce the session-polling loop from 30 iterations (3 seconds max) to be more responsive — the session is usually available immediately
- Show tenant-appropriate context if `?tenant=` param is present (e.g. "Redirecting to PostNet..." instead of generic text)

### 3. Cart/orders lost after Google OAuth sign-in

This is the core bug. When a user is on a tenant portal with an anonymous session and signs in via Google OAuth:

1. They get redirected to Google, then back to `/auth/callback?tenant=postnet`
2. `AuthCallback` establishes a new authenticated session (the anonymous session is gone)
3. The `oauth-callback` edge function creates a customer membership but **never transfers the anonymous user's draft/cart orders**
4. The user lands on the tenant portal with an empty cart

**Fix — wire `claim-anonymous-orders` into the OAuth flow:**

**`src/components/auth/SocialAuthButtons.tsx`:**
- Before redirecting to Google, save the current anonymous user ID to `localStorage` (e.g. `dc_anon_user_id`) so we can retrieve it after the OAuth redirect

**`src/pages/AuthCallback.tsx`:**
- After the session is established and `oauth-callback` succeeds, check `localStorage` for `dc_anon_user_id`
- If present, call `claim-anonymous-orders` with that anonymous user ID to transfer draft/cart orders
- Clear the localStorage key after claiming
- Then navigate to the tenant storefront (the existing routing logic handles this)

### Technical Details

```
Flow before fix:
  Anon session → Google OAuth → new session → oauth-callback → navigate
  (anonymous orders orphaned)

Flow after fix:
  Anon session → save anon user ID to localStorage → Google OAuth → 
  new session → oauth-callback → claim-anonymous-orders(anon_id) → navigate
  (orders transferred to new user)
```

**Files to modify:**
1. `src/components/auth/SocialAuthButtons.tsx` — persist anonymous user ID before OAuth redirect
2. `src/pages/AuthCallback.tsx` — call claim-anonymous-orders after successful tenant OAuth, simplify loading UI

No database or edge function changes needed — `claim-anonymous-orders` already exists and handles the transfer correctly.
