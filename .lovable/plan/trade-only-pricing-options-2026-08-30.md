# Trade-only pricing options

Make a pricing option (e.g. "Untrimmed flat sheet + collating only" on A2 Deskpads) visible only to customers marked as trade.

## Admin

In the pricing options editor (Master Pricing → product's options & extras), each option row gains a **Trade only** checkbox next to its label and slug. Off by default, so nothing changes for existing options.

Optional same toggle on paid extras is out of scope unless you want it — say the word and I'll add it.

## Customer

The existing tier resolver (`useCustomerPricingTier`) already returns `consumer` or `trade` based on the membership/company trade flag. Everywhere a pricing option is offered, the list is filtered:

- Consumer / guest: trade-only options are hidden entirely, and their pack ladder rows are excluded from quantities and prices.
- Trade: sees everything, at trade prices.

Applies to the supplied-artwork builder (deskpads), the templated-artwork builder, and the storefront product page's "from" price.

Edge case: if a product's only options are trade-only, a consumer sees no option selector and no pack quantities — the product then falls back to the existing no-pack behaviour. Worth checking Deskpads still has a consumer option before going live.

## Technical notes

- `PricingOption` gains `trade_only?: boolean`; `normalizeOptions` reads and preserves it (jsonb on `product_families.pricing_options` — no migration).
- New helper in `src/lib/pricing/packOptions.ts`: `visibleOptions(options, tier)` and a tier-aware guard inside `packQuantitiesForOption` so a trade-only slug's rows never price for a consumer (defence in depth — a tampered client can't select it and get a price).
- `FamilyPricingOptionsEditor.tsx`: add the checkbox column.
- `UploadedArtworkBuilder.tsx`, `TemplatedArtworkBuilder.tsx`: replace `pricingOptions` with the filtered list before the default-selection effect and the selector render.
- `StorefrontProduct.tsx`: filter the same way when computing the displayed price.
