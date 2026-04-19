
The user uploaded a new "Web to Print Made Easy" SVG with a tighter bounding box (48mm tall vs the previous 123mm), which was the root cause of the excessive vertical spacing. Combined with the prior tightening plan, this should bring the hero into the reference proportions.

### Changes

1. **Replace headline asset**
   - Copy `user-uploads://web_to_print_made_easy_v2.svg` → `src/assets/web-to-print-made-easy.svg` (overwrite existing).
   - The old file had ~280px of empty whitespace baked in; the new file is cropped tight, so the rendered SVG height drops dramatically without changing any CSS.

2. **Tighten hero spacing in `src/pages/MarketingLanding.tsx`**
   - Section padding: `py-12 lg:py-14` → `py-8 lg:py-10`
   - Grid: remove `items-center`, use `items-start`
   - Headline SVG `max-w`: `460px` → `420px`, with `mt-2`
   - Subhead: `mt-4`
   - Bullets: `mt-5` (keep 2-col grid)
   - CTAs: `mt-5`
   - Trust line: `mt-3`
   - Optional `min-h-[520px] lg:min-h-[560px]` on the hero container so the image has a predictable frame and the right side stays balanced even with the now-shorter content.

3. **No structural / routing / logo changes** — only the headline SVG swap and spacing tweaks.

### Expected result
Hero collapses to ~560–600px tall at desktop, headline sits just under the nav, copy block is dense and lives entirely within the image frame — matching the reference screenshot.
