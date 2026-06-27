## Problems to fix

1. **Welcome link burns on first click.** Supabase recovery `token_hash` is a single-use OTP — verifying it once invalidates it, even if the user never finishes setting a password. The user wants the link to stay usable for the full 1-hour window until the password reset is actually completed.
2. **Multi-branch owners aren't modelled in the campaign.** `send-branch-welcome-campaign` looks up the profile by email and only adds a membership for the targeted branch, but the welcome copy/landing assumes "your branch" singular. If the same email already runs another branch, the new membership is silently added with no acknowledgement, and the email/UX still talks as if they're a brand-new user.

## Solution overview

Stop handing Supabase OTPs directly to the user. Instead, mint our own opaque campaign token, store it server-side, and exchange it for a fresh Supabase recovery session on every click — until the user completes password setup, at which point we mark our token consumed.

### 1. New table `platform_onboarding_tokens`

Columns: `token` (random 32-byte url-safe, unique), `campaign_recipient_id` fk, `tenant_id`, `branch_id`, `profile_id`, `email`, `expires_at` (default `now() + 1 hour`), `consumed_at`, `last_used_at`, `use_count`, `created_at`. RLS: no anon/auth access (only service role / edge functions).

### 2. Edge function changes

- **`send-branch-welcome-campaign`**: instead of calling `auth.admin.generateLink` and emailing the Supabase verify URL, insert a row into `platform_onboarding_tokens` and email a link like `https://<origin>/welcome?token=<opaque>`. Store the opaque token (not the Supabase OTP) on the campaign recipient row for audit.
- **New `redeem-onboarding-token`** (public, `verify_jwt = false`): accepts `{ token }`, validates it's not consumed and `expires_at > now()`, bumps `use_count`/`last_used_at`, then calls `auth.admin.generateLink({ type: 'recovery', email })` server-side and returns the freshly-minted `action_link` (or the parsed `token_hash` + redirect path). The caller's browser then navigates to that URL — single-use Supabase OTP is fine because we mint a new one every click.
- **New `complete-onboarding-token`**: called from `ResetPassword.tsx` immediately after `supabase.auth.updateUser({ password })` succeeds; marks `consumed_at = now()` so further clicks on the same welcome link return "already completed".

### 3. New page `/welcome`

Replaces the direct Supabase verify URL. On mount it POSTs the `token` to `redeem-onboarding-token`, then `window.location.replace`s to the returned Supabase action link (which lands on `/auth/verify` → `/reset-password?recovery=1` exactly as today). Failure states: `expired`, `already_completed`, `not_found` — each with its own copy and a "Go to sign in" button. `AuthVerify.tsx` keeps its current error UI for the rare case the freshly-minted OTP fails.

### 4. `ResetPassword.tsx`

Read `?welcome_token=<opaque>` (passed through by `/welcome` → action_link → verify → reset). After a successful password update, call `complete-onboarding-token` with that token (best-effort, ignore failure). Without this, the welcome link would simply expire after 1 hour, which is acceptable but less precise.

### 5. Multi-branch owners

- `send-branch-welcome-campaign`: after profile lookup, detect whether the email already has any `tenant_memberships`. Pass `existing_memberships_count` into the template var set (`is_returning_user = "true"|"false"`, `existing_branch_count`).
- Update the seeded `welcome_branch_manager` template to render a short "You already manage other branches — this link adds {{branch_name}} to your account" line when `is_returning_user` is truthy. Plain-text fallback included.
- If the email already has a Supabase user **and** a session-capable password, switch the link copy from "set your password" to "open {{branch_name}}". Implementation: still mint the same opaque token, but the redeem function chooses `type: 'magiclink'` instead of `recovery` when the profile already has `last_sign_in_at`. Lands them straight in `/t/<slug>/<branch>` instead of `/reset-password`.
- Membership insert already de-dupes via existence check — keep, but log the "added new branch to existing user" event into `platform_email_campaign_recipients.status` as `sent_existing_user` for visibility in the History tab.

### 6. Communications History UI

Show per-recipient `use_count` and `consumed_at` from the new token table (joined view) so the platform admin can see "clicked 3×, completed" vs "never clicked".

## Out of scope

- No change to Supabase auth template or the underlying `auth-email-hook`.
- No change to PayFast / billing flows.
- No retroactive migration of already-sent campaigns — existing recipient rows keep their old single-use links.

## Technical notes

- Opaque token format: `crypto.getRandomValues(32 bytes)` → base64url. Stored as-is (high-entropy, no need to hash for this threat model, but we can hash with sha256 if you'd prefer — say the word).
- `redeem-onboarding-token` is the only place that calls `auth.admin.generateLink`; service role key never leaves the edge runtime.
- 1-hour window enforced by `expires_at` check in the redeem function, independent of Supabase's own OTP TTL (which restarts on each mint).
- Rate-limit: cap `use_count` at, say, 20 to stop abuse if a link leaks.
