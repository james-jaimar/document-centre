# Fix the 2027 Edition storefront on phones

## What's actually happening

I loaded the 2027 Edition home page at phone width (390px wide) and captured it. The page is not just cramped — it is **wider than the phone**: the browser stretched the layout to 520px to fit content that doesn't shrink. That single overflow is what makes everything look wrong (headline cut off mid-word, hero image sitting on top of the text, everything slightly zoomed out).

Confirmed on the captures:

1. **Size comparison band** — the A4 / A3 / A2 boxes are set to fixed pixel widths on one non-wrapping row, roughly 600px in total. This is the thing forcing the whole page wide.
2. **Hero** — headline "SIZE REALLY DOES MATTER" runs off the right edge; on phones the picture is layered behind the words instead of sitting above them; the spec line ("A2 — 594 x 420 mm" etc.) collides with the buttons.
3. **Reassurance strip at the top** — four items squeezed into stacked centred lines, wasting the top of the screen.
4. **Feature cards** — full-width and very tall, so a single card fills more than a screen; you scroll a long way to see three of them.
5. **Shop page** — no overflow, but there is a large empty grey gap between the last product and the footer.

## What I'll change (mobile only — desktop stays exactly as it is)

- **Size band:** boxes become proportional (percentage-based) and wrap onto two rows on small screens, so the page can never be wider than the phone. Heading and text sit above them.
- **Hero:** on phones, picture on top, words underneath in normal flow; headline scales down so it never clips; buttons go full-width and stack; spec facts become a tidy stacked list.
- **Top strip:** two items per row on phones, left-aligned, tighter.
- **Feature cards:** shorter image area and tighter padding on phones so more than one card is visible at a time.
- **Shop/product/cart:** remove the empty filler gap above the footer so the footer sits right under the content.
- Sweep every storefront section (how-it-works, trade banner, wide banner, product cards, footer strip) at 390px and fix anything else that overflows or clips.

## Technical notes

- Files: `src/components/storefront/SizeCompare.tsx` (root cause — swap fixed `width`/`height` px styles for aspect-ratio + `%` widths with `flex-wrap`), `HeroSection.tsx` (mobile stacked variant of both `full` and split layouts), `AssuranceBar.tsx`, `FeatureCards.tsx`, `WideBanner.tsx`, `TradeBand.tsx`, plus the `.dc-storefront` container/heading clamps in `src/index.css`.
- Filler gap: the customer shell's `min-h` on the content area (`src/components/CustomerLayout.tsx`) — footer moves to sit directly after content.
- Presentation only: no changes to storefront settings, data, pricing or routing. All existing platform settings keep working unchanged.

## Verification

Re-capture home, shop, product and cart at 390px and 430px: page width must equal the phone width on every page (no horizontal scroll), no clipped headings, hero readable, footer directly under content.
