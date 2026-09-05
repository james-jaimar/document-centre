# A richer landing page for The 2027 Edition

## Recommendation

Do it as **settings, not hard-code**. Everything in the render is the same handful of building blocks you already have (hero, feature row, three product cards, a dark banner, an assurance strip) — just taller, image-led and with more copy fields. Hard-coding a one-off page for this tenant means every future tweak comes back to me, and the next tenant gets nothing.

So: extend the storefront config with a few new, optional sections and richer hero controls, and expose them all in the existing platform Storefronts editor. The 2027 Edition then gets set up entirely by filling in the fields. Any tenant that leaves the new sections empty keeps today's page exactly as it is.

## What gets added

**Deeper hero**
- Height control (standard / tall / full-bleed) so the hero can run the full first screen like the render.
- Copy position (left / centre / right) and copy width, so text sits over the light area of the photo.
- Secondary CTA can render as a plain text link with an arrow instead of an outlined button.
- Optional "spec line" under the CTAs — a row of short facts separated by dividers ("594 × 420 mm | Short runs | Personalised").

**New: Size comparison section** (the "A little calendar is easy to ignore" block)
- Heading, short body, and a list of size chips (label, dimensions, highlighted yes/no) drawn as proportional outlined rectangles, largest highlighted in the accent colour.
- Entirely optional; hidden if no chips are added.

**New: Feature cards row** (Desk Pads / Monthly Planners / Wall Calendars)
- 2–4 cards, each with title, one or two lines of copy, a large image, and a link label + destination (a shop category, a product, or a custom path).
- Big image area, matching the render's proportions.

**New: Wide banner section** ("Sell big. Without buying big.")
- Full-width dark panel: heading, body lines, background image, and a text-link CTA.
- Background image, overlay strength and text side are settable.

**Assurance strip**
- Extended to 4 items with title + subtitle and a wider icon set (pencil, layers, truck, heart, shield, clock, etc.) to match the render's footer strip.

**Section ordering + visibility**
- A simple list in the editor to toggle each landing section on/off and drag the order (hero, product/category grid, size comparison, feature cards, banner, how it works, trade band, assurance, footer strip).

**Typography preset**
- A per-tenant heading style choice (current sans vs. the tall serif in the render), applied only inside the storefront scope. This is what gives the render its editorial, non-SaaS feel.

## Technical details

- Extend `StorefrontPagesConfig` in `src/hooks/useStorefrontPages.ts` with `hero_height`, `hero_align`, `hero_spec_items`, `hero_secondary_style`, `size_compare`, `feature_cards`, `wide_banner`, `section_order`, `heading_font`. All optional with defaults that reproduce today's page; `coerce()` fills gaps so existing tenant rows keep working.
- New components in `src/components/storefront/`: `SizeCompare.tsx`, `FeatureCards.tsx`, `WideBanner.tsx`. `HeroSection.tsx` gains the height/align/spec-line props; `AssuranceBar.tsx` gains a 4-up variant.
- `StorefrontHome.tsx` renders sections from `section_order` instead of a fixed sequence.
- `PlatformStorefrontDetail.tsx` gets new editor cards for each section, with repeatable-row editors and image upload/URL fields reusing the existing image handling.
- Storefront tokens and the optional serif heading scale live in `src/index.css` under the `.dc-storefront` scope — no hardcoded colour utilities.
- No schema change: it is all the one JSON row in `tenant_settings`.

## Then

Once merged I'll populate The 2027 Edition's config to match the render (copy, size chips, three feature cards, trade banner, four assurance items) so you can see it live and adjust from the editor.

## Questions folded in

Images for the feature cards and banner: I'll use the tenant's existing uploads where they exist and leave placeholders where they don't — tell me if you want me to source or generate stand-ins.
