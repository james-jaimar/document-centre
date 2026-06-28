
# Country indicator + tenant country column

Adds a lightweight country layer ahead of a possible PostNet USA rollout, without disturbing the current SA-only setup.

## 1. Database

Migration on `public.tenants`:
- Add `country_code CHAR(2) NOT NULL DEFAULT 'ZA'` (ISO-3166-1 alpha-2).
- Backfill: all existing rows become `'ZA'` via the default.
- Add a CHECK that `country_code` is two uppercase letters (validation trigger if a CHECK is too rigid — per project rules we prefer triggers, but a simple regex CHECK on a static format is safe).
- No RLS changes; column is readable wherever `tenants` already is.

Nothing else changes — no new tables, no changes to pricing regions, branches, delivery, or VAT. Those stay driven by their existing mechanisms.

## 2. Platform admin

In the existing Tenant edit screen (Platform → Tenants → edit):
- New "Country" select (ZA 🇿🇦, US 🇺🇸 for now; list is a small static map so we can add more later without a migration).
- Saved into `tenants.country_code`.

## 3. Customer header flag

In `src/components/CustomerHeader.tsx` and `src/components/customer/mobile/MobileHeader.tsx`:
- New `<CountryFlagBadge />` placed immediately to the right of the branch picker (and in the mobile header in the same logical slot).
- Reads `tenant.country_code` from `useTenantFromSlug()`.
- Renders an emoji flag + country short name (e.g. 🇿🇦 South Africa). Tooltip on hover.
- Click opens a dropdown listing:
  - 🇿🇦 South Africa — active, checkmark on current.
  - 🇺🇸 United States — shown but disabled with a "Coming soon" label.
- Selecting an active country in future will route to that country's tenant; for now only ZA is selectable so clicking it is a no-op.
- No geolocation yet — that's a Phase 2 once a US tenant exists. We'll leave a `// TODO: geolocate` marker pointing at the existing `detect-region` edge function so we can wire it later without re-architecting.

## 4. Where it does NOT appear

- Admin / Platform / Branch headers — out of scope per your answer.
- Pricing, currency, VAT, delivery — untouched. `useRegionalPricing` and `tenant_settings.default_currency_code` keep doing their job; the flag is purely an identity/UX cue.

## Technical notes

- Country list lives in a tiny `src/lib/countries.ts` (code → { name, emoji }) so adding more is one-line.
- Flag rendered as a Unicode regional-indicator emoji — no image assets, no CSP changes.
- Existing tenant queries already `select *` from `tenants` in most places, so the new column flows through without refactors; the few typed selects get `country_code` added.
- Once a USA tenant exists, enabling the dropdown entry is a one-line change (filter by "tenants that exist for this country") — no schema work.

## Out of scope (deliberately deferred)

- Geolocation auto-switch.
- Branch-level country (branches inherit tenant country).
- Multi-country pricing/VAT/delivery wiring.
- Admin-header flags.
