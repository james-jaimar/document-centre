## Goal
For Google-signed-in customers, the Security tab should simply acknowledge Google as the sign-in provider and link out to Google. Remove the "Set a password for email sign-in" path entirely — no Supabase reset email, no local password creation for social-only accounts.

## Changes
In `src/pages/dashboard/CustomerAccount.tsx` `SecurityPanel`:

**Google-only accounts:**
- Card heading: **Sign-in method**
- Body: "You sign in with Google as **{email}**. Your password is managed by Google."
- Single action: **Manage your Google Account** button, Google-branded (white background, subtle border, multi-colour Google "G" SVG icon on the left), opens `https://myaccount.google.com/security` in a new tab.
- Remove the `Set a password for email sign-in` button.
- Remove the `sendSetupEmail` function and the `resetPasswordForEmail` call.

**Mixed accounts (Google + email password):**
- Keep the existing Change password form as primary.
- Footer note: "Linked sign-in methods: Google" with the same small Google "G" mark.

**Password-only accounts:**
- Unchanged — existing Change password form.

**Future providers (Apple/Microsoft):**
- Keep `SOCIAL_PROVIDER_META` structure so the same "provider-managed, link out to provider" pattern can be applied later, but only Google is wired today.

## Out of scope
- No backend changes.
- No changes to sign-in/sign-up flows.
- No provider linking/unlinking UI.
