# Google sign-in on the2027edition.com lands on the Document Centre home page

## What is happening

Sign-in starts on `the2027edition.com` and the app asks Google to come back to
`https://the2027edition.com/auth/callback?tenant=the-2027-edition&next=…`
(this is what the sign-in button builds today — it always uses the address you are currently on).

Google returns the user to Supabase, and Supabase only sends people on to a return address
that is on its allow-list. When the address is not allowed, Supabase silently falls back to its
default site address — `document-centre.com` — which is exactly the page you ended up on, signed
out, because a session created on one domain does not exist on another.

Unconfirmed until checked: whether `the2027edition.com` is actually missing from that allow-list.
That check is step 1 below, and everything else follows from it.

## Plan

1. **Check the allow-list first.** Open the Supabase Auth URL configuration and confirm whether
   `https://the2027edition.com/auth/callback` and `https://the2027edition.com/**` are listed
   (plus the `www.` forms). If they are missing, adding them fixes the sign-in immediately —
   no code change needed. This is a settings change you make in the Supabase dashboard; I will
   give you the exact values to paste.

2. **Stop the silent dump.** Regardless of the cause, landing on a stranger's home page with no
   explanation is the wrong outcome. Add a small guard on the Document Centre home page: if
   someone arrives there straight after starting a sign-in elsewhere (we already store where they
   came from), show a short "Sign-in could not be completed — return to <their shop>" panel with a
   link back, instead of the marketing page.

3. **Make new custom domains safe by default.** Add a one-time check in the platform Domains
   screen that flags a tenant domain whose sign-in return address has not been allow-listed yet,
   so the next tenant does not hit this after go-live. Presented as a warning with the two values
   to add.

4. **Verify end to end.** Sign in with Google from the tenant domain and confirm you land back on
   the 2027 Edition shop, signed in, with the customer account attached to that tenant only.

## Technical notes

- Return address is built in `src/components/auth/SocialAuthButtons.tsx` from
  `window.location.origin` — correct as-is; no change required there.
- `src/pages/AuthCallback.tsx` handles the tenant-scoped flow correctly; it is simply never
  reached when Supabase rejects the redirect target.
- The guard in step 2 sits alongside `src/components/auth/OAuthReturnRedirect.tsx` /
  `src/components/AppEntryRedirect.tsx`, keyed off the existing `dc_return_path` value plus a
  stored origin, and only fires when there is no session.
- No database, RLS or edge-function changes.
