## Root cause

The PostNet tenant `logo_url` is an **SVG** (`tenant-assets/.../logo.svg`). The screenshot is Outlook, which **does not render SVG `<img>` in email** (it also strips `border-radius`, which is why the CTA looks like a flat red rectangle). The same template renders fine in Gmail/Apple Mail/web preview, which is why "other PostNet emails" appear to work — it's a client-rendering issue, not a code bug per tenant or per email type.

In-app pages don't have this problem because browsers render SVG natively.

## Fix

Add an **email-safe logo URL** that is always a raster (PNG/JPG) and use it in every transactional email helper.

### 1. New tenant branding setting

Add an optional `logo_email_url` setting (category `branding`, public). When set, emails use it. When not set, emails fall back to `logo_url` only if it is a raster format; otherwise they fall back to the text portal name (current behaviour for "no logo").

Detection rule (no DB migration needed beyond the new setting key):
```
isRasterLogo = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url)
```

### 2. Branding admin UI

In `src/pages/admin/AdminBranding.tsx` (or wherever `logo_url` is edited), add a sibling upload field "Email logo (PNG)" that writes `logo_email_url`. Show a hint that SVG is fine for the web but emails need PNG. Keep `logo_url` as-is so the portal/auth pages keep using the crisp SVG.

### 3. Email helpers

Update every transactional email function to read both keys and pick the email-safe one. Centralise the selection in a small shared helper to avoid drift:

`supabase/functions/_shared/emailLogo.ts`
```ts
export function pickEmailLogo(logoUrl: string|null, logoEmailUrl: string|null): string|null {
  if (logoEmailUrl) return logoEmailUrl;
  if (logoUrl && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(logoUrl)) return logoUrl;
  return null; // caller renders text fallback
}
```

Wire it into all eight functions that currently read `logo_url`:
- `invite-member` (the failing one in the screenshot)
- `request-signup`
- `request-password-reset`
- `manage-user`
- `mobile-upload`
- `send-order-email`
- `quote-pdf`
- `generate-invoice-pdf`

### 4. Backfill PostNet immediately

Set `logo_email_url` for the PostNet tenant to the existing PNG version of the PostNet logo (admin uploads via the new field, or one-off SQL insert into `tenant_settings`).

## Out of scope

- Auth pages / portal UI continue to use `logo_url` (SVG is correct there).
- No change to favicon handling — PNG already.
- No change to Outlook CTA rounded-corners (separate cosmetic, can address later with VML bulletproof button if desired).

## Verification

1. After deploy, re-trigger "add member" for a test user on PostNet → email arrives with PostNet PNG logo visible in Outlook desktop.
2. Send password-reset and signup emails → same PNG logo renders.
3. Tenants without `logo_email_url` set whose `logo_url` is PNG: logo still shows (unchanged).
4. Tenants with SVG-only logo and no email PNG: portal name text shows (no more broken image icon).
