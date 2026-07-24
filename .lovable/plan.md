## Goal

Add an optional **Brand Strip** — a full-width branded band that renders **above** the existing `CustomerHeader` on the customer/storefront portal. Toggleable per tenant, with a configurable image (and background colour fallback), so tenants like 3@1 can duplicate their real-store header look (blue band + centred logo lockup) without us touching the working navigation header.

## Scope

- Customer-facing storefront/portal only (`CustomerLayout` → renders above `CustomerHeader`).
- Not applied to Admin, Branch, or Platform portals.
- No changes to navigation, cart, sign-in, branch picker, or existing header logic.

## Tenant settings (new, category = `branding`, non-sensitive)

Stored in `tenant_settings` alongside existing branding keys, so they flow through `useTenantBranding` and the public RLS policy automatically:

- `brand_strip_enabled` (boolean) — master toggle.
- `brand_strip_image_url` (string) — full-bleed image (e.g. the uploaded 3@1 JPEG). Rendered as a `background-image`, `background-size: cover`, `background-position: center`.
- `brand_strip_bg_color` (string, optional hex) — solid fallback / matte when the image doesn't cover extra-wide viewports.
- `brand_strip_height` (string, optional; default `88px` desktop / `56px` mobile) — lets tenants tune the band height.
- `brand_strip_link_url` (string, optional) — if set, the strip is a link (e.g. to the parent brand site).

Defaults added to `useTenantBranding.ts` `DEFAULTS` + `TenantBranding` interface.

## UI changes

1. **New component** `src/components/BrandStrip.tsx`
   - Reads `useTenantBranding(tenantId)`.
   - Returns `null` if `brand_strip_enabled` is false or no image/color set.
   - Renders a full-width `<div>` (or `<a>` if `brand_strip_link_url`) with the background image, sized to the configured height, no inner content required (the image itself carries the logo lockup, matching the uploaded strip).
   - Uses semantic tokens for the fallback colour; no hard-coded colours.

2. **`src/components/CustomerLayout.tsx`**
   - Insert `<BrandStrip />` immediately above `<CustomerHeader />` (line ~192).
   - No layout math changes; header stays sticky as today, brand strip scrolls away naturally (standard behaviour for these retail sites).

3. **Splash screen** — extend the existing branded splash to also show the brand strip once branding hydrates, so there's no flash between splash → strip appearing.

## Admin configuration UI

Add a **Brand Strip** section to the existing tenant Branding settings page (same screen as `portal_name`, `logo_url`, `hero_image_url`):

- Toggle: "Enable brand strip above header".
- Image uploader (reuses existing tenant asset upload flow — same bucket/pattern as `logo_url` / `hero_image_url`).
- Colour picker for fallback background.
- Height input (px, with sensible min/max).
- Optional link URL.
- Live preview panel showing the strip + current header stacked, at both desktop and mobile widths.

Guidance copy: recommend a 1920×88 (or similar) horizontally-tileable/centred image so the logo lockup stays centred on wide screens.

## Data / migration

Single migration adds default rows only where needed — none required at schema level since `tenant_settings` already stores arbitrary keys. No new tables, no RLS changes (existing branding policy already allows public read of non-sensitive branding keys).

For the 3@1 tenant specifically, after merge we upload the supplied JPEG via the new admin UI and toggle it on — no seed migration needed.

## Out of scope

- Changing the existing header layout, logo position, or navigation.
- Applying the strip to admin/branch/platform portals.
- Multi-strip / carousel behaviour.
- Per-branch overrides (tenant-level only for v1; can add branch override later if requested).

## Files touched

- `src/hooks/useTenantBranding.ts` — add fields to interface + defaults.
- `src/components/BrandStrip.tsx` — new.
- `src/components/CustomerLayout.tsx` — mount `<BrandStrip />`.
- Tenant Branding admin page (existing settings screen) — add Brand Strip section + preview.

## Verification

- Toggle off (default): storefront looks identical to today.
- Toggle on with 3@1 image: blue strip with centred lockup renders above header on desktop and mobile; header still sticky; no layout shift on load thanks to cached branding.
- Other tenants unaffected.
