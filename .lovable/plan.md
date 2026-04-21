

## Create Pricing Page for Document Centre

A new `/pricing` public marketing page using the same `.dc-marketing` design system as the landing page -- same header, footer, colours, typography, and card styles.

---

### What gets built

A full pricing page with these sections (top to bottom):

1. **Header** -- reuses the same sticky header as the landing page (logo, nav links, Sign In / Try It Now buttons)
2. **Hero** -- "Online ordering for print shops, without the usual file headaches" with eyebrow, subtitle, and trust line
3. **Three pricing cards** -- Starter ($149), Core ($199, featured with "Most Popular" badge), Multi-Branch ($349) with feature lists and CTAs
4. **Expansion note** -- "Need more branches? We can scale with you."
5. **Value section** -- "Why shops choose Document Centre" with 4 value cards (fewer file problems, less manual checking, better confidence, print-ready output)
6. **Comparison table** -- 12-row feature matrix across the 3 plans with check marks and dashes
7. **FAQ section** -- 6 questions in a 2-column grid (setup fees, branding, file types, PDFs, small shops, branches, trial)
8. **Bottom CTA** -- "Sell print online without making it complicated" with gradient card, two buttons
9. **Footer** -- same footer as landing page

### Design approach

- Wrapped in `.dc-marketing` so all existing CSS variables (`--dc-navy`, `--dc-blue`, `--dc-green`, `--dc-orange`, `--dc-sky`, `--dc-border`) and utility classes (`.dc-card`, `.dc-btn`, `.dc-eyebrow`, `.dc-muted`) apply automatically
- Same `max-w-[1240px]` container, same font stack, same card border-radius (24px)
- Featured card gets a blue border, upward translate, and gradient "Most Popular" badge
- Feature list items use green checkmarks
- Comparison table in a `.dc-card` wrapper with sticky first column on mobile
- FAQ items styled as `.dc-card` cards in a 2x3 grid
- Fully responsive: single column on mobile, 3-col pricing grid on desktop

### Technical details

**Files created:**

- `src/pages/Pricing.tsx` -- the full pricing page component, sharing the header/footer pattern from `MarketingLanding.tsx` (extracted as inline components or duplicated with the same markup)

**Files modified:**

- `src/App.tsx` -- add `<Route path="/pricing" element={<Pricing />} />` as a public route
- `src/pages/MarketingLanding.tsx` -- update the "Pricing" nav link from `href="#pricing"` to `to="/pricing"` (using `Link` from react-router-dom), and similarly in the footer

**No new CSS file needed** -- the existing `.dc-marketing` scoped styles in `src/index.css` plus Tailwind utilities cover everything. A few pricing-specific styles (featured card border, badge gradient, comparison table) will be inline or as small Tailwind classes.

**No new dependencies.**

### Content

All copy comes directly from the ChatGPT draft provided. Prices in USD. CTAs link to `/try` (Try It Now / Start Free Trial) and `/auth?mode=register` (Start Plan). "Book a Demo" / "Talk to Us" on Multi-Branch links to a `#cta` anchor or contact route.
