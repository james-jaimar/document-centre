# Invite sign-in: stop dropping people at a form that fills in the wrong account

## What actually happened

Nothing is wrong with the company or the user you created.

- "The 2027 Edition" exists as a company in Impress Print.
- `hello@the2027edition.com` was created there at 13:20, is active, and is linked to that company and branch.
- At 13:25 that invite link was opened and the password was set successfully.

Immediately after the password was saved, the app signed the person out and sent them to the Impress Print sign-in page. The browser then filled the form with your own saved login, `james_b_hawkins@me.com` — that is the address in your screenshot. That account has no place in Impress Print (it belongs to The 2027 Edition, Demo and PostNet), so the portal correctly refused it.

So the error is accurate, but the app created the trap: it forced a fresh sign-in right after someone proved who they were, and the saved-password autofill quietly swapped the account.

## The fix

1. **Stay signed in after setting a password from an invite.** Once the new password is saved, take the person straight into the portal they were invited to, instead of signing them out and showing a sign-in form. This is already how the branch welcome link behaves; the customer invite should match it.

2. **Make the mismatch message say who is signed in.** When an account genuinely doesn't belong to that portal, say "You're signed in as james_b_hawkins@me.com, which isn't part of Impress Press (Pty) Ltd" and offer a "Use a different account" action that clears the fields. Right now it's impossible to tell that the form silently changed the email.

3. **Stop the sign-in form being pre-filled with a stale account on a tenant portal** by marking the email field so browsers offer the address rather than silently overwriting it.

## Technical notes

- `src/pages/ResetPassword.tsx` (lines 117-123): the non-`welcome_token` branch signs out and navigates to the tenant auth path. Change it to resolve the user's active `tenant_memberships` and navigate via the existing `pickPrimaryMembership` / `resolveTenantLanding` helpers, keeping the session. Fall back to the current sign-out behaviour only when no membership resolves.
- `src/pages/Auth.tsx` (lines 119-131): include `session.user.email` in the mismatch message, and render a secondary button that signs out and clears the email/password state.
- No database or edge function changes — the invite path (`invite-member`, membership insert) is working correctly.

## Verification

Re-run the real flow: create a test user on the 2027 Edition company in Impress Print, open the invite in a fresh browser profile, set the password, and confirm it lands in the Impress Print portal without a sign-in step.
