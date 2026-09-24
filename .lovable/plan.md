# "Book a Demo" button on the demo store → contact page

## What we found

The button at the bottom of the demo storefront (`/t/demo`, the "Want this working for your print shop?" band) is the **trade band**. Its label ("BOOK A DEMO") comes from the demo tenant's storefront settings, but its destination is hard-coded in `src/pages/storefront/StorefrontHome.tsx`: it navigates to the account page, which bounces anonymous visitors to the login page. The same hard-coded destination applies to every tenant's trade band.

## Plan

Make the trade-band button's destination a configurable setting (matching the existing pattern used by the wide-banner CTA), then point the demo tenant's at the contact page.

1. **Add `trade_cta_path` to the storefront config** (`src/hooks/useStorefrontPages.ts`):
   - New field on the type, default `"account"` (current behaviour, so nothing changes for existing tenants unless set).

2. **Use it in `StorefrontHome.tsx`**: the trade band's click handler navigates to `config.trade_cta_path || "account"`. Tenant-relative values (e.g. `account`) stay inside the tenant portal; values starting with `/` (e.g. `/contact`) navigate directly.

3. **Add a "Button link" field to both admin editors** so it stays admin-driven, no hard-coding:
   - Platform → tenant storefront editor (`src/pages/platform/PlatformStorefrontDetail.tsx`, Trade band section).
   - Tenant admin storefront panel (`src/components/platform/TenantStorefrontPagesPanel.tsx`, Trade band & footer section).

4. **Set the demo tenant's config** (`tenant_settings`, category `storefront`, key `config`, tenant `72347b5f-...`): `trade_cta_path = "/contact"` so the BOOK A DEMO button opens the Document Centre contact page.

## Verification

- Typecheck (`npx tsgo --noEmit -p tsconfig.app.json`) and `git diff --check`.
- Playwright on the public demo store: load `/t/demo`, click BOOK A DEMO, confirm it lands on `/contact` with the contact form.
- Confirm no change for other tenants (default still `account`).
