## What's happening

Google sign-in on the 3at1 storefront takes the user to `document-centre.com` instead of back to 3at1's cart.

## Root cause (confirmed)

- Tenant custom domains (from DB):
  - **Postnet** → `postnetprintcentre.com` (works)
  - **3 at 1** → `3at1printcentre.com` (broken)
  - **Jetline** → no custom domain, served under `document-centre.com/t/jetline`
- `SocialAuthButtons.tsx` builds `redirectTo` from `window.location.origin`, so on 3at1 it asks Supabase to redirect back to `https://3at1printcentre.com/auth/callback?tenant=3at1`.
- Supabase Auth only honours `redirectTo` values that match an entry in **Auth → URL Configuration → Redirect URLs**. When it doesn't match, Supabase silently falls back to the project **Site URL** (currently `https://document-centre.com`) — exactly the "landed on document-centre homepage" symptom.
- Postnet works because `postnetprintcentre.com` was added when we launched it. `3at1printcentre.com` was never added.
- **Jetline** has no custom domain, so `window.location.origin` is already `https://document-centre.com`, which is on the allowlist. Jetline is fine as-is — no action needed until it gets its own domain.

This is a Supabase dashboard configuration issue, not a code bug. Code is behaving correctly.

## Plan

1. **You (or I via the Supabase settings) add the following to Supabase → Authentication → URL Configuration → Redirect URLs**:
   - `https://3at1printcentre.com/auth/callback`
   - `https://3at1printcentre.com/**` (wildcard so future paths like password reset also work)
2. **Verify by test**: from the 3at1 cart, click "Continue with Google" → should land back on `https://3at1printcentre.com/t/3at1/.../cart` (or the branch cart).
3. **Add an operational checklist item** to `mem://saas/tenant-onboarding-lifecycle` (or a new memory) that says: whenever a tenant is given a custom domain, add `https://<domain>/auth/callback` and `https://<domain>/**` to the Supabase Auth redirect allowlist. This prevents the same trap for the next tenant.
4. **Jetline**: no change needed while it stays on `document-centre.com/t/jetline`. If/when Jetline gets its own domain, apply the same allowlist entries.

## Optional follow-up (not in this change unless you want it)

Add a lightweight platform-admin check that, for every tenant with a `custom_domain`, pings Supabase Auth settings (or shows a manual checkbox "Redirect URL registered ✓") so this misconfiguration is visible in the tenant admin UI instead of only surfacing when a customer tries to log in.

Want me to also add that admin-side visibility check, or just do the Supabase allowlist entries?
