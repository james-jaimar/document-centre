# Sample packs for trade buyers

Goal: let a trade customer build a three-item sample pack — one deskpad, one monthly planner, one calendar — using the normal design templates, at a single fixed price of R495 including delivery.

## Where they hear about it

- A banner strip on the shop page and a callout box on each of the three product pages: "Not sure yet? Build your own sample pack — one deskpad, one planner and one calendar with your own branding on them, R495 delivered."
- A card on the customer dashboard for trade accounts that have never ordered.
- A button in the sales/marketing email templates linking straight to the sample pack page.

All of these only appear for signed-in trade accounts that haven't already had a pack. Everyone else sees nothing, so the offer stays a trade thing.

## What the customer does

A three-step guided page (`/t/:slug/sample-pack`):

```text
Step 1  Deskpad          -> pick a design, complete it   [done]
Step 2  Monthly planner  -> pick a design, complete it   [done]
Step 3  Calendar         -> pick a design, complete it   [done]
        Review & checkout -> R495 delivered
```

Each step opens the same design tool they'd use for a real order — same templates, same upload of their logo/header, same preview — but with the quantity fixed at 1 and the quantity selector hidden. They can leave and come back; progress is saved because each finished step lands in their basket as usual.

The pack must be complete (all three) before checkout. The basket shows the three items with "Sample pack" on them and a single R495 line instead of the item prices. Delivery is included, so no courier charge is added and the delivery address is still collected as normal.

Payment goes through the usual checkout — PayFast or invoice, depending on what the tenant allows.

## What admin gets

- **Settings → Products → Sample pack**: on/off, price (R495), which product families are in the pack, trade-only on/off, one-per-company on/off, and the wording shown on the shop.
- Sample pack orders are badged "Sample pack" in the orders list, with a filter for them, so production knows it's a one-off of each and sales can follow up.
- A staff action on a company: "Allow another sample pack", for when someone genuinely needs a second.
- Company page shows whether a sample pack has been sent and when.

## Pricing rules

- The fixed price replaces the sum of the three items; it is stored net with VAT added on top the same way as any other order.
- Delivery is zero-rated on these orders regardless of weight or zone.
- If an item is removed so the pack is incomplete, the order reverts to normal pricing and the sample pack flag is dropped — no way to get a single calendar at R495.

## The supplier side (Impress Print)

The pack is printed by Impress Print, so the order has to land there as something they can actually process and invoice. A quantity of one doesn't exist anywhere on their trade ladder, so the copy would price at nothing sensible. Fix it with a dedicated trade item rather than bending the ladders.

- In the supplier's **Wholesale catalogue**, a new **Trade sample pack** entry: on/off, a trade price (what they charge you for one of each), and the list of their products it covers. They set it up once; it's never shown to their other customers.
- When a sample pack order comes across, the copied order carries **the three artwork items at quantity one each**, priced at zero, plus **one "Trade sample pack" line** at the agreed trade price. Production sees exactly what to print; accounts sees one charge.
- The copied order is badged "Sample pack" on their side too, so it can't be mistaken for a normal repeat job.
- Delivery on the copied order is priced from their own rates as it already is — that carriage is a real cost to you, so your R495 is not cent-for-cent; your own admin order screen shows trade price + carriage against the R495 collected, so you can see exactly what each pack costs you and adjust the R495 if it's underwater.
- If the supplier hasn't set a trade sample pack price, the order still goes across but is flagged "sample pack not priced" on both sides instead of silently landing at zero.

## Technical notes

- New tenant setting category `sample_pack`: `enabled`, `price_minor`, `family_ids[]`, `trade_only`, `one_per_company`, `headline`, `blurb`.
- `orders` gains `is_sample_pack boolean default false` (migration, with an index for the admin filter). Items are ordinary `order_jobs`; the flag lives on the order.
- New page `src/pages/dashboard/SamplePack.tsx` — a stepper that reuses `TemplatedArtworkBuilder` / `UploadedArtworkBuilder` per family with `quantity` locked to 1 and a `samplePack` mode flag, routed in `App.tsx`, plus `src/hooks/useSamplePack.ts` for eligibility (trade via `resolveTradeMembership`, prior-pack check) and progress (which of the three families are already in the cart).
- Repricing lives server-side in `order-engine`: a `sample_pack` guard that, on cart mutation and on submit, checks the cart contains exactly one job per configured family, then sets `subtotal = price / uplift`, `delivery_amount = 0`, recomputes VAT and total, and sets `is_sample_pack`. The client only displays; it never sets the price. Eligibility is re-checked on submit so the flag can't be forged.
- `useCart.ts` surfaces `isSamplePack` for basket display; `Checkout.tsx` skips the delivery quote when the flag is set but still requires a delivery address.
- Admin: badge and filter in `AdminOrders.tsx`, the settings panel under `src/pages/admin/settings/`, and the re-issue action on `AdminCompanyDetail.tsx`.
- Storefront entry points: a `SamplePackBanner` component used on `StorefrontShop.tsx`, `StorefrontProduct.tsx` and the customer dashboard, hidden unless eligible.
- Supplier side: a `sample_pack` row on the supplier tenant (`supplier_offerings` gains `is_sample_pack` + `sample_trade_price_minor`, or an equivalent single settings row), surfaced in `AdminSuppliers.tsx` → wholesale catalogue.
- `supabase/functions/_shared/supplier-mirror.ts`: when the source order has `is_sample_pack`, bypass `supplierTradePriceMinor` (qty 1 never matches a ladder row), set every mirrored job's `net_price`/`cost_price`/`gross_price` to 0, append one synthetic job/adjustment line "Trade sample pack" at the configured trade price, set `is_sample_pack` on the mirror, and write `metadata.sample_pack_unpriced` plus an admin-visibility `timeline_events` note when no price is configured. Carriage pricing stays exactly as it is today.
- Buyer-side margin view: the admin order's supplier panel shows trade price + supplier carriage vs the R495 taken.

## Order of work

1. Migration: `orders.is_sample_pack`, supplier sample-pack price fields, tenant setting defaults.
2. Server-side pricing and eligibility guard in `order-engine`.
3. The guided sample pack page and eligibility hook.
4. Basket and checkout display, delivery skip.
5. Admin settings, badge, filter, re-issue action.
6. Supplier wholesale-catalogue entry and the mirror's sample-pack path.
7. Storefront and dashboard entry points.
