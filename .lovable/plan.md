

## The problem

The invite email contains a Supabase-hosted action link:
`https://lcvdhtaqoumyokjqaqfw.supabase.co/auth/v1/verify?token=...&redirect_to=https://...lovableproject.com/reset-password`

That's because `invite-member/index.ts` calls `admin.auth.admin.generateLink({ type: "recovery" })` and embeds `linkData.properties.action_link` in the email. Supabase's `action_link` always points at `{SUPABASE_URL}/auth/v1/verify` — it does the token exchange and *then* redirects to your `redirectTo`. So users see the raw Supabase domain in the URL bar (and in the email body, which is what they're complaining about).

The same pattern is used in `manage-user` (resend invite) and likely `invite-platform-admin` — both need the same fix.

## The fix

Stop using Supabase's `verify` URL. Instead, use the `hashed_token` that `generateLink` also returns and build our own app-hosted link that does the verification client-side.

### How it works

`generateLink({ type: "recovery" })` returns:
- `properties.action_link` — the Supabase-hosted URL (what we're using now, what we want to drop)
- `properties.hashed_token` — the raw token
- `properties.email_otp` — OTP code
- `properties.verification_type` — e.g. "recovery"

We build the link ourselves:
```
https://{app-origin}/auth/verify?token_hash={hashed_token}&type=recovery&next=/reset-password
```

A new public route `/auth/verify` runs `supabase.auth.verifyOtp({ token_hash, type })` on mount, then navigates to `next`. Result: the user only ever sees the app domain.

### Picking the right app origin

The Edge Function currently uses `req.headers.get('origin')` as the base. That works for the inviter's session but isn't reliable for emails. Better source of truth: a per-tenant `portal_url` (already part of branding settings — tenants like PostNet have their own subdomain/path). Resolution order in the function:

1. `tenant_settings.branding.portal_url` for this tenant (preferred — matches the tenant's storefront)
2. `tenant_settings.global.app_url` (platform-wide default)
3. `req.headers.get('origin')` (fallback — the admin's current portal)

Never fall back to the Supabase URL.

### Files

| File | Change |
|---|---|
| `src/pages/AuthVerify.tsx` *(new)* | Reads `token_hash`, `type`, `next` from query string. Calls `supabase.auth.verifyOtp({ token_hash, type })`. On success, navigates to `next` (default `/reset-password`). On failure, shows a friendly error with a "Request a new link" CTA. |
| `src/App.tsx` | Add public route `/auth/verify` → `<AuthVerify />`. |
| `supabase/functions/invite-member/index.ts` | Replace the `action_link` block with a `hashed_token`-based app URL. Add `resolveAppOrigin(tenantId)` helper that reads tenant branding `portal_url` first, then falls back to caller origin. |
| `supabase/functions/manage-user/index.ts` | Same change for the `resend_invite` action. |
| `supabase/functions/invite-platform-admin/index.ts` | Same change (verify it follows the same pattern; if it does, fix it). |
| *(optional, follow-up)* `supabase/functions/_shared/buildAuthLink.ts` | Extract the link-building helper so all three functions share it. |

### Visual / UX

`/auth/verify` shows a centered spinner with "Verifying your invitation…" — no Supabase branding ever, just the tenant's portal. On failure (expired, used, invalid), shows: "This link has expired or already been used. Please ask your admin to resend the invitation."

### Migration / cleanup

No DB migration. Existing in-flight invite emails (sent before this change) will still work — the old Supabase verify URL keeps functioning until the user opens it. New invites will use the app-hosted link.

### Out of scope (flag if needed)

- Email change confirmation, magic link login, signup confirmation — same pattern applies but those flows aren't currently exposed in your custom invite system, so no immediate action needed.
- The bigger "Lovable auth email templates" infrastructure (with React Email + the `auth-email-hook` edge function) — your project uses a custom SMTP `send-email` function instead, which is fine and works. No need to migrate.

