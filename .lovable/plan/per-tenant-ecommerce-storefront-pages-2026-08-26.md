# Per-tenant ecommerce storefront pages

Give tenants an optional set of custom, shop-style front-facing pages (landing, shop, product detail, editor shell) that reuse our existing design system and real catalogue data, switched on per tenant.

## About the uploaded UI kit

The zip is a rough Next.js prototype, not a facsimile of the four renders. It matches the **layout and section order** (assurance bar, branded header, hero + product strip, 3-step how-it-works, trade band; shop filters + grid; product gallery + config card + price-break table; editor 3-column shell), but the visuals are CSS-art placeholders and emoji glyphs (🛒, ▣, ◇) instead of real imagery and icons. So: use it as a structural reference, and take the visual fidelity from the PNG renders, expressed with our tokens, shadcn components and lucide icons.

## Enablement (platform admin only)

Custom pages are a platform-level capability I switch on per tenant — tenants cannot enable or configure them. A new `storefront_pages` setting group is written from the **Platform admin → Tenant detail** screen (per-page toggles: landing, shop, product, editor chrome). When off, the current storefront behaviour is unchanged. No Storefront tab is added to tenant settings, and writes are restricted to platform admins.

## Pages

**Landing** — assurance bar (3 items), branded header with nav + Track Order/account/cart, hero (copy + CTAs + hero image), product strip from real product families with "From <price>", 3-step how-it-works, trade band with CTA.

**Shop** — filter sidebar (product type, size, ordering method, price range), results toolbar (count, sort, grid/list toggle), product cards with badge ("Customise online" vs "Upload artwork" derived from `supports_editable_artwork`), description, turnaround, from-price and action button.

**Product detail** — breadcrumb, gallery with thumbnails, title, feature chips, config card (size/quantity/paper/etc. from resolved options), price-break table with highlighted active row, your-price/turnaround box, primary CTA (Start designing → editable builder, or Upload artwork → existing upload flow), delivery/collect strip, spec accordions.

**Editor shell** — header chrome only (back, product name, save state, undo/redo, Preview proof, Continue) plus the right-hand order summary (price, VAT, review checkbox, Add to cart). The editor canvas stays as the existing templated-artwork builder.

## Page content (platform admin)

The same platform-admin panel holds the copy: assurance-bar items, nav links, hero eyebrow/heading/sub-copy/CTA labels, how-it-works steps, trade band copy + CTA, footer strip text, plus the per-page toggles — stored in `tenant_settings` under category `storefront`. Existing tenant branding (logo, colours, fonts, hero image) is reused, not duplicated. Tenant admins see nothing new; they keep editing branding as today.

## Data

Real data throughout: visible product families for the tenant/branch, catalogue options via the existing resolvers, and prices via the existing pricing hooks (from-price = cheapest break; product page table = real price breaks, VAT handling as today). Missing hero images fall back to a neutral tokenised placeholder.

## Technical notes

- New folder `src/components/storefront/` with `AssuranceBar`, `StorefrontHeader`, `HeroSection`, `ProductStrip`, `HowItWorks`, `TradeBand`, `ShopFilters`, `ProductCard`, `PriceBreakTable`, `EditorShell`.
- New pages `src/pages/storefront/StorefrontShop.tsx` and `StorefrontProduct.tsx`; `StorefrontLanding.tsx` gains an ecommerce branch driven by the toggle.
- Routes added inside `customerRoutes()` so both `/t/:slug/...` and subdomain hosts work; guarded by the toggle with a redirect to today's pages when off.
- New hook `useStorefrontPages(tenantId)` reading the `storefront` settings category with defaults, mirroring `useTenantSettingsMap`; reads are public (storefront needs them), writes are gated to platform admins.
- New platform-admin panel `src/components/platform/TenantStorefrontPagesPanel.tsx` surfaced on the tenant detail screen.
- Styling stays on our semantic tokens plus tenant `--storefront-*` CSS variables; a scoped `.dc-storefront` block in `index.css` holds the shop-specific type scale/spacing so nothing leaks into the admin UI. No hardcoded colour utilities.
- A migration may be needed only to allow platform-admin writes / public reads for the `storefront` category on `tenant_settings`; the RLS policies will be checked first and adjusted only if they don't already permit it.

## Out of scope for this pass

Template editor internals, cart/checkout redesign, trade-account signup flow, reviews/ratings data (chips shown only if a value exists).
