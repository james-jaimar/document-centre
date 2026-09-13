# Finish the sample pack so you can actually see it

You're right — nothing is visible yet. Here's what actually exists and what's missing.

## What's already built

- The sample pack page itself, at `/t/<tenant>/sample-pack`.
- The eligibility rules (trade only, one per business).
- The flat pack price, free delivery and the server-side checks at checkout.
- A promo banner component.

## Why you can't see any of it

1. **There is no settings screen.** The pack is configured by settings (on/off, price, which products), but no screen was ever added to Settings to edit them, so you can't switch it on.
2. **It is off by default.** Until it's switched on and given its three products, the page shows "Sample packs aren't available" and the offer is hidden everywhere.
3. **The banner is never shown.** The banner was written but never placed on the shop page, product pages or the customer dashboard.

## What I'll do

1. **Add a "Sample pack" tab to tenant Settings** (next to Products/Financial): a switch to turn it on, the pack price, a picker to choose which products are in the pack, trade-only and one-per-business switches, and the headline and wording customers see.
2. **Put the banner where customers will see it**: the shop page, each included product page, and the customer dashboard — only for signed-in trade accounts that haven't had a pack yet.
3. **Add a "Sample packs" entry in the customer's side menu** when they're eligible, so there's an obvious way in.
4. **Switch it on for The 2027 Edition** with the three products (deskpad, monthly planner, calendar) at R495 delivered, so you can try it end to end as your trade login.
5. **Check it live** as a trade customer: banner shows, all three steps complete, basket shows one R495 line with no delivery charge.

## Admin-side follow-ups (same pass)

- "Sample pack" badge and filter on the orders list, so these don't look like ordinary jobs.
- "Allow another sample pack" action on a business, for genuine repeats.

## Technical notes

- New `src/pages/admin/settings/SamplePackTab.tsx` writing the seven `sample_pack` keys via `useBulkUpsertTenantSettings`, wired into `AdminSettings.tsx` tabs.
- Mount `SamplePackBanner` in `StorefrontShop.tsx`, `StorefrontProduct.tsx` (when the family is in `familyIds`) and the customer dashboard; it already self-hides when not eligible.
- Nav entry via the existing customer portal sidebar, gated on `useSamplePack().eligible`.
- Seed the 2027 Edition settings rows by migration/data write, resolving the three `product_families` ids by slug.
- Orders list: badge/filter on `orders.is_sample_pack`; company action updates `customer_companies.sample_pack_allowance`.
