# Storefront pages: render-faithful redesign + platform Storefronts admin

Two parts: (1) rebuild the landing, shop and product pages so they match the uploaded renders in layout, sizing and density, (2) add a proper Platform admin area to see and control them instead of a small panel inside the tenant edit dialog.

## 1. Visual fidelity pass

Current screenshots differ from the renders in a few structural ways. Each gets fixed:

**Chrome and page frame** (portal header stays, as agreed)
- When storefront pages are on, the customer sidebar is hidden and the content area runs full-width edge-to-edge, so the storefront sections span the viewport like the renders instead of sitting in the padded portal column.
- Assurance bar becomes the thin top strip above the header area (three centred items, small type, light grey band) rather than the tall band it is now.
- Slim footer strip: secure checkout / payment options / help contact line.

**Landing**
- Hero: left copy column at the render's proportions (large tight-leading headline ~clamp 40–60px, short two-line sub-copy, solid primary + outline secondary buttons), right image filling the hero to the right edge and bleeding to the top. Neutral tokenised placeholder when no hero image exists.
- Product strip: 6 compact cards in one row on desktop (title on top, image, "From R x" in accent green with an arrow), noticeably smaller than today's cards.
- How-it-works: single bordered panel with three columns split by vertical rules, numbered blue circles and line icons — not three separate cards.
- Trade band: single bordered green-tinted strip with icon, heading, three ticked benefits and a right-aligned CTA button.

**Shop**
- Page heading with right-hand "Retail prices (incl. VAT) / sign in for trade pricing" note.
- Filter sidebar: collapsible groups with chevrons, checkboxes plus per-option counts, price range with two inputs and a slider, "Clear filters" button at the bottom. Product-type labels are humanised (e.g. "Bound document", not `bound_document`).
- Results toolbar: count on the left, "Sort by" select plus grid/list toggle on the right; list view added.
- Cards: image-first with a coloured status pill overlaid top-left ("Customise online" green / "Upload artwork" blue), title, one-line description, turnaround line with a truck icon, and a footer row of "From R x" with a single primary action button. Three per row.

**Product detail**
- Breadcrumb, then two columns: large gallery with a thumbnail rail (prev/next arrows) on the left; on the right title, feature chips, then the config card.
- Config card: 2×2 selector grid (size, quantity, paper, backing/sides), price-break table with the active row highlighted, and a right-hand "Your price / incl. VAT / turnaround" box beside the table.
- Full-width primary CTA, delivery/collect split strip, then Specifications / Artwork area / Delivery accordions.

**Styling rules**: everything stays on the existing semantic tokens and shadcn components. A scoped `.dc-storefront` block in `index.css` carries the storefront type scale, container width (max-w-7xl) and section rhythm so nothing leaks into admin views. No hardcoded colour classes; the accent green and pill colours become storefront tokens.

## 2. Platform admin: Storefronts

New top-level Platform admin section `/platform/storefronts`.

- **List view**: every tenant with storefront status (Off / On, which pages are enabled), storefront URL and an "Open storefront" link.
- **Detail view** `/platform/storefronts/:tenantId`: full-page editor replacing the cramped dialog panel, with tabs:
  - *Pages* — master switch and per-page toggles (landing, shop, product, editor).
  - *Landing* — hero eyebrow/heading/sub-copy/CTA labels, hero image upload, assurance-bar items (add/remove/reorder, icon picker), how-it-works steps, trade band copy + CTA.
  - *Shop & product* — shop heading and sub-copy, pricing note text, turnaround copy, footer strip text, accordion section copy.
  - *Imagery* — per-product-family storefront images: hero/gallery images uploaded per tenant and per family, replacing the hard-coded slug→image map (the map stays as fallback).
- Live preview link out to the tenant storefront from both views.
- The existing panel in the tenant edit dialog is replaced by a short summary + "Manage storefront" link.

## Technical notes

- `StorefrontPagesConfig` in `useStorefrontPages.ts` gains the new copy fields plus `nav`/`shop`/`product` copy groups and an `images` map (`familyId -> string[]`); `coerce()` keeps defaults so existing rows stay valid.
- Images upload to the existing storage bucket used for tenant branding, saved as paths in the config JSON — no new tables needed. Config still lives in `tenant_settings` (category `storefront`, key `config`); reads public, writes platform-admin only (policies already in place, will be re-checked before relying on them).
- `CustomerLayout` gains a storefront mode: reads `useStorefrontPages`, and when a storefront page is active, hides `CustomerSidebar` and drops the content padding. Route-scoped so `/orders`, `/account` etc. keep the normal portal shell.
- New components: `StorefrontProductStrip`, `StorefrontFooterStrip`, `ShopToolbar`, `ProductGallery`, `ProductConfigCard`, plus rewrites of `AssuranceBar`, `HeroSection`, `HowItWorks`, `TradeBand`, `ProductCard`, `ShopFilters`, `PriceBreakTable`.
- New admin files: `src/pages/platform/PlatformStorefronts.tsx`, `src/pages/platform/PlatformStorefrontDetail.tsx`, with routes and a nav entry in the platform sidebar.
- Real data throughout — no change to catalogue, pricing or ordering logic.

## Out of scope

Editor page chrome (already handled by the templated-artwork builder), cart/checkout redesign, reviews data, trade-account signup flow.
