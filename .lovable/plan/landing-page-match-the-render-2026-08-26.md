# Landing page: match the render

Focus on the storefront landing page only. Two goals: a real full-bleed hero image, and much more of the page visible in one laptop viewport.

## What's wrong today

Comparing the current screenshots against the render and the UI kit CSS:

- The hero right column is an empty grey placeholder — no hero image is set for the tenant, and there is no shipped default.
- Vertical rhythm is far looser than the kit: hero copy padding, a "Popular products" heading block, `py-12`/`py-14` sections, tall cards and a tall trade band push the fold down so only the hero fits on a laptop.
- Content is boxed to a centred 1240px container; the render runs edge-to-edge with ~4.5% side padding.
- Product strip cards are tall (title / 96px image / price row); the render's cards are compact with a ~100px art area and small 14px titles.
- How-it-works is a bordered card grid with an 8-unit top margin and a centred heading; the render is one low grey rounded panel with three inline rows split by rules — no big heading.
- Trade band is a padded 7-unit block; the render is an 82px-high bordered green strip.

## The changes

**Hero**
- Two-column grid at the render proportions (48% copy / 52% image), min-height ~440px, image bleeding to the right and top edges.
- Copy column: eyebrow, headline at ~47px with tight leading, two-line sub-copy, solid primary + outlined secondary buttons (54px tall).
- Ship a default hero image asset so the hero is never empty; tenant/admin hero image still overrides it. The right column keeps `object-cover` so any uploaded photo fills the panel.

**Density pass**
- Storefront container switches to full-width with 4.5% side padding (still capped on very wide screens).
- Product strip moves directly under the hero with the kit's tight padding, no section heading block; six compact cards with ~100px art, 14px titles, "From R x" in accent green with an arrow.
- How-it-works becomes a single grey rounded panel with three columns separated by vertical rules, numbered blue circle + icon inline with the title, 12px body copy, no section heading.
- Trade band becomes a single bordered green strip: round icon, heading, ticked benefits inline, right-aligned CTA.
- Assurance bar and footer strip stay thin.

**Config**
- The landing copy fields stay as they are; `strip_heading`/`strip_subcopy` become optional (rendered only if the admin fills them in, off by default) so the strip sits tight under the hero like the render.

## Technical notes

- Files: `src/index.css` (`.dc-storefront` container + type scale), `src/components/storefront/HeroSection.tsx`, `ProductStrip.tsx`, `HowItWorks.tsx`, `TradeBand.tsx`, `src/pages/storefront/StorefrontHome.tsx`.
- Default hero image added as a Lovable asset and used as the last fallback after `config.hero_image_url` and tenant branding.
- All colours stay on the existing `--sf-*` storefront tokens; no hardcoded colour utilities.
- Verified after the change with a Playwright screenshot at laptop width (1280×800) against the render.

## Out of scope

Shop and product pages (next passes), platform admin editor changes, catalogue/pricing logic.
