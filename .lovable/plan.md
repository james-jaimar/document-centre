## Goal

Remove the "check your email → click → set password → sign in" detour on the tenant portal `/auth` sign-up. New customers enter email + password (+ name) once, get logged in immediately, and land in the portal. The email that arrives is a friendly welcome, not a verification gate.

## Current state

- `src/pages/Auth.tsx` register form collects only **email + display name** and shows the toast "Check your email to set your password and sign in." Password input is hidden in register mode.
- `request-signup` edge function already supports an optional `password` field — when present it creates the user with that password, marks `email_confirm: true`, skips the recovery link, and sends a "Welcome — you're all set" email pointing at `/t/<slug>/print-centre` (no "Set your password" CTA).
- `CheckoutAuth.tsx` already does the desired flow (request-signup with password → `signInWithPassword`), so the pattern is proven.

## Changes

1. **`src/pages/Auth.tsx` — `handleRegister`**
   - Require `email` **and** `password` (min 6 chars), same validation as login.
   - Call `request-signup` with `{ email, password, display_name, first_name, last_name, tenant_slug }`.
   - On success, immediately `supabase.auth.signInWithPassword({ email, password })`.
   - On sign-in success, navigate to the tenant landing route (same redirect logic already used after login) — no toast about checking email, just a brief "Welcome" toast.
   - Keep the existing error surface for duplicate-email / weak-password cases.

2. **`src/pages/Auth.tsx` — register form UI**
   - Show the password field in register mode (it's already rendered for login; just stop hiding it / add it to the register branch).
   - Label it "Create password" with the 6-char hint. Keep `autoComplete="new-password"`.
   - Leave the "Forgot password?" link visible only in login mode (already the case).

3. **No edge function changes needed.** `request-signup` already:
   - Skips the recovery link when `password` is supplied.
   - Sends the welcome email with CTA "Go to My Print Centre" instead of "Set your password".
   - Creates the tenant membership and profile.

4. **No DB / migration changes.**

## Out of scope

- Existing flow on `/t/<slug>` checkout (`CheckoutAuth.tsx`) already works this way — untouched.
- Google OAuth button — untouched.
- Password-reset flow for existing users — untouched.
- Email verification policy at the Supabase project level — untouched (we keep `email_confirm: true` server-side so the user is usable instantly).

## Verification

- New signup on PostNet portal: enter name, email, password → land on `/t/postnet/print-centre` signed in, no email-click required.
- Inbox receives "Welcome to PostNet — you're all set" with a "Go to My Print Centre" button (no password link).
- Duplicate-email case: backend returns the existing profile path; sign-in then fails with "Invalid credentials" if the password differs — surface that as "An account already exists for this email. Try signing in or use Forgot password."
