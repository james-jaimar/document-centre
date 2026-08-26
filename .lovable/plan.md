# Landing page: faithful render match

Rework the tenant storefront landing page to follow the supplied render and its CSS proportions directly. The selected visual treatment is Impress navy with Sora headings and Manrope body copy; the supplied render remains the authority for layout, spacing, sizing, and hierarchy.

## Changes

### Hero
- Keep the tenant-uploaded hero photograph full-width and fully visible with `object-cover`, with no dark overlay, scrim, tint, opacity reduction, or gradient over the image.
- Match the render’s shallow, first-viewport hero proportions and place the headline, supporting copy, and two CTAs directly over the natural light area of the image.
- Use a constrained copy width and responsive positioning so the photograph remains legible and unobscured on desktop and mobile.

### Tenant-active product strip
- Remove the “Popular products” heading, subcopy, and “View all” row from the landing page entirely; the product cards will begin immediately below the hero.
- Render only product families explicitly enabled for the current tenant and, when a branch is selected, enabled and available for that branch.
- Remove the current fail-open behaviour that returns every master product when capability data is empty or unavailable. Loading must remain a loading state rather than briefly exposing the full catalogue.
- Keep the reference’s compact single-row desktop presentation: six evenly sized cards where available, product name, contained product image, price/view label, and arrow. Wrap cleanly on narrower screens.

### Lower-page styling
- Rebuild the process row to match the render: one low pale-grey band, three equal columns, vertical separators, numbered blue circles, larger outline icons, compact heading/body alignment, and no visible section title.
- Rebuild the trade row as the render’s slim green-outlined strip: circular customer icon, bold heading, inline divider, three tick benefits, and a right-aligned green CTA.
- Tighten all gaps, card padding, border radii, border weight, icon sizing, and vertical rhythm so the hero, complete product strip, process band, and trade band are visible together at a standard laptop viewport.
- Keep colours semantic through the storefront token scope; update those tokens to the selected white / pale blue-grey / Impress navy / Impress blue palette with the existing green trade accent.

## Technical details

- Update the storefront-scoped tokens and typography in `src/index.css`; load Sora and Manrope through the existing document/font mechanism rather than CSS URL imports.
- Simplify `StorefrontHome.tsx` so it has no product-strip heading path.
- Adjust `HeroSection.tsx`, `ProductStrip.tsx`, `HowItWorks.tsx`, and `TradeBand.tsx` to mirror the supplied composition.
- Correct `useVisibleProductFamilies.ts` so tenant toggles and branch capabilities are authoritative and their loading states are surfaced to `useStorefrontCatalogue.ts`/the landing page.
- Preserve platform-admin content controls, tenant hero upload, catalogue navigation, pricing labels, and CTA behaviour.

## Verification

- Compare the finished page side-by-side with the supplied render at 1280×800, checking section heights, alignment, card density, and that the hero image has no darkening.
- Verify a tenant with disabled products never renders those products and that an empty/loading capability response does not fall back to all master products.
- Check a mobile viewport for readable overlaid hero copy, orderly product wrapping, and stacked lower bands without overlap.
