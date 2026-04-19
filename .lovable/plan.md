
The user wants the hero section to match the reference: full-width hero image with all left-column content (headline SVG, subhead, bullets, CTAs, trust line) fitting **within** the image's height — not extending below it into white space.

Looking at the reference screenshot:
- Hero image is full-width and acts as the section's natural background
- Left column content (logo header + headline + subhead + 2-col bullets + 2 CTAs + trust line) all fits within the image's vertical bounds
- The image has print-shop blur on the right, white/light fade on the left where copy sits

Current problem: Image is rendered as `w-full h-auto` (natural aspect), and left content `relative` column flows independently — when content is taller than image, content extends below into white space.

### Fix approach

1. **Stack content over image properly**: Use a CSS Grid / relative container where the image sits as background and copy overlays it. Image keeps its aspect but content is constrained to fit.

2. **Tighten left-column spacing** to match reference density:
   - Reduce headline SVG max-width (currently likely too tall)
   - Tighter gaps between subhead → bullets → CTAs → trust line
   - Two-column bullet grid (reference shows 2x3 grid, not single column)
   - Smaller CTA buttons matching reference proportions

3. **Image strategy**: Render image as `w-full` with `object-cover` on a container whose height is set by the content (or by an aspect ratio that matches the reference ~ 21:9 / 2.3:1). Copy sits absolutely or in a grid cell over the left ~50%.

4. **Responsive**: On mobile, image becomes a top banner or hides; copy stacks naturally.

### Concrete changes to `src/pages/MarketingLanding.tsx`

```text
HERO SECTION
├── relative container (full-width, no fixed height)
│   ├── <img> absolute inset-0, w-full h-full object-cover  
│   │   (image fills the section, content determines height)
│   ├── content grid (relative, max-w-7xl, py-16 lg:py-20)
│   │   └── left column (col-span 6/12)
│   │       - headline SVG (max-w ~520px)
│   │       - subhead (text-lg, mt-5)
│   │       - bullets (grid-cols-2 gap-x-8 gap-y-3, mt-6)
│   │       - CTAs (flex gap-3, mt-7)
│   │       - trust line (flex gap-5, mt-5, text-sm)
│   │   └── right column (empty — image shows through)
```

The image becomes the section background (object-cover), so it always fills regardless of content height. Content sets the section height naturally and stays inside it. The pre-blended white-fade on the left of the image keeps copy readable.

### Tweaks to ensure fit at 1142px viewport
- Headline SVG: `max-w-[480px]` (down from current larger)
- Bullets: 2-column grid (compact)
- Buttons: `py-3 px-6` (smaller than current `py-6`)
- Section padding: `py-14 lg:py-16` (down from `py-32`)
- Remove the bottom fade gradient div (no longer needed since image fills)

This matches the reference exactly: full-bleed image + tight left column that lives inside the image's frame.
