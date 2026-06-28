## Goal
On the customer **My Account → Security** tab, detect when the signed-in user authenticates via a social provider (Google, and future Apple/Microsoft) and replace the "Change password" form with provider-aware guidance, instead of letting them set a local password that they can never use to sign in.

## Detection
Use `supabase.auth.getUser()` → `user.identities[]`. Classify the account:
- **Password identity present** (`identities.some(i => i.provider === 'email')`): show the existing Change password form as-is.
- **Only social identities** (e.g. `google`): hide the form and show the provider panel below.
- **Both**: show Change password form, plus a small "You can also sign in with Google" note.

## UI when account is Google-only
Replace the Change password card with a "Sign-in method" card:

- Heading: **Sign-in method**
- Body: "You sign in with **Google** ({email}). Your password is managed by Google, so there's nothing to change here."
- Secondary action: **Set a password for email sign-in** — optional. Clicking it sends a password-setup email via `supabase.auth.resetPasswordForEmail(user.email, { redirectTo: <tenant>/reset-password })` and shows a toast: "Check your inbox to set a password." This lets a Google user *add* email/password as a second sign-in method without us silently writing a password they don't know exists.
- Link: "Manage your Google account" → `https://myaccount.google.com/security` (opens in new tab).

When **both** identities exist, keep Change password as the primary card and add a small "Linked sign-in methods: Google" line underneath.

## Files to change
- `src/pages/dashboard/CustomerAccount.tsx` — read `user.identities`, branch the Security tab render, add the provider panel and the "Send password setup email" action. No backend changes; uses existing Supabase auth APIs and the existing `/reset-password` route.

## Out of scope
- Apple/Microsoft branding (structure supports them; only Google shows today).
- Unlinking providers, 2FA, session management — separate future work.