## Problem

Branch staff receive invites, but the password-set page and the post-reset sign-in page render at `document-centre.com/reset-password` and `document-centre.com/auth` — the platform shell, not the tenant's branded portal (e.g. PostNet Print Centre at `/t/postnet`). The tenant identity is lost as soon as the user clicks the email link.

## Root cause

1. `invite-member` builds the action link as `${appOrigin}/auth/verify?...&next=/reset-password` — no tenant slug in the path.
2. `ResetPassword.tsx` always redirects to `/auth` after a successful update — no tenant slug either.
3. There are no `/t/:slug/reset-password` or `/t/:slug/auth/verify` routes, so even if the link contained the slug the page wouldn't mount under the tenant shell.

## Plan

### 1. Add tenant-scoped routes (`src/App.tsx`)
Inside the existing storefront tenant route group (alongside `/t/:slug/auth`), add:
- `/t/:slug/auth/verify` → `<AuthVerify />`
- `/t/:slug/reset-password` → `<ResetPassword />`
- `/t/:slug/:branchSlug/auth/verify` and `/t/:slug/:branchSlug/reset-password` for branch-aware parity

These mount inside the same storefront layout that already applies tenant branding (logo, primary colour, portal name), so the password page will look like the tenant's portal.

### 2. Build tenant-prefixed links in `invite-member` (`supabase/functions/invite-member/index.ts`)
- Look up the tenant slug (already have `tenant_id`) and pass it to a new helper variant `buildAppVerifyLink(appOrigin, linkData, next, slugPrefix?)`.
- The generated link becomes:
  `https://document-centre.com/t/postnet/auth/verify?token_hash=...&type=recovery&next=/t/postnet/reset-password`
- Apply the same change to `request-password-reset` and `manage-user` (resend invite) so all flows are consistent. `invite-platform-admin` stays unprefixed (no tenant).

### 3. Post-reset redirect to the tenant's sign-in (`src/pages/ResetPassword.tsx`)
- Read the current location: if the path starts with `/t/:slug` (or `/t/:slug/:branchSlug`), navigate to `/t/:slug/auth` (or `/t/:slug/:branchSlug/auth`) on success instead of `/auth`.
- Keep `/auth` fallback for platform/staff resets.

### 4. `AuthVerify` already honours `next` from query, so no change needed beyond mounting it at the tenant path so any branded chrome (if added later) is consistent.

## Out of scope

- Custom subdomains per tenant (e.g. `postnet.document-centre.com`) — still possible later by setting `branding.portal_url`, which `resolveAppOrigin` already prefers.
- Changing the email sender domain.

## Files touched

- `src/App.tsx` — add 4 routes
- `src/pages/ResetPassword.tsx` — tenant-aware post-reset redirect
- `supabase/functions/_shared/buildAuthLink.ts` — add optional slug prefix
- `supabase/functions/invite-member/index.ts` — pass slug
- `supabase/functions/request-password-reset/index.ts` — pass slug
- `supabase/functions/manage-user/index.ts` — pass slug

No DB migration required.