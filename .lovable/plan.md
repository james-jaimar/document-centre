
# Fix Tenant Header/Footer Facsimile System

## Problems Identified

From the screenshots:

1. **`/t/postnet` (StorefrontLanding)** -- Shows a generic branded landing page with "PostNet South Africa | PostNet" text in the nav. This page is **standalone** and does NOT use the facsimile header/footer system at all. It should wrap itself in the scraped PostNet header/footer when facsimile is enabled.

2. **`/t/postnet/dashboard` (CustomerLayout)** -- The facsimile header renders but is broken: just "Call Us Now: 0860 767 8638" and a tiny broken PostNet logo, then a completely empty content area below. The scraped HTML is clearly low quality and the CSS isolation (`all: initial`) is nuking inherited styles needed by the content area.

3. **Demo/Try page** (screenshot 3) shows the correct experience a PostNet customer should see -- products, upload area, sidebar -- but with Document Centre branding instead of PostNet's.

## Plan

### 1. Fix StorefrontLanding to use facsimile header/footer

When `facsimile_enabled` is true for a tenant, the `StorefrontLanding` page should replace its built-in nav/footer with the scraped facsimile header/footer. The hero, features, and CTA sections stay but sit between the tenant's header and footer.

**File**: `src/pages/storefront/StorefrontLanding.tsx`
- Import `useTenantBranding` (already imported)
- When `branding.facsimile_enabled && branding.header_html`, render the facsimile header div instead of the generic nav bar
- Same for footer: render facsimile footer instead of the generic footer
- Add the same click-neutralisation logic used in `CustomerHeader.tsx`

### 2. Fix CSS isolation breaking the content area

The current `all: initial` on `.facsimile-header` is too aggressive -- it creates an isolation boundary that can interfere with layout. The facsimile container should be isolated but not break the flex layout of `CustomerLayout`.

**File**: `src/index.css`
- Scope `all: initial` more carefully -- apply it only to the inner content, not the wrapper div, so the flex layout of CustomerLayout remains intact
- Ensure the facsimile container has `width: 100%` and `display: block`

### 3. Improve scrape-branding Edge Function

The current scraper extracts the first `<header>` element but PostNet's site likely uses a complex structure. The scraper needs to:
- Try multiple selectors and pick the **largest** match (by HTML length) rather than the first
- Also grab the linked stylesheets from the page (not just inline `<style>` tags) since most sites load CSS externally
- Resolve relative image URLs (like the PostNet logo) to absolute URLs so they render in our app
- Increase Firecrawl `waitFor` for JS-heavy sites

**File**: `supabase/functions/scrape-branding/index.ts`
- When extracting header/footer, try all selectors and pick the one with the most content
- Add a `resolveUrls()` function that converts relative `src` and `href` attributes to absolute URLs based on the origin
- Request `rawHtml` format from Firecrawl (unprocessed HTML) in addition to `html` to get better fidelity
- Extract linked stylesheet URLs from `<link rel="stylesheet">` tags and attempt to fetch + inline them (up to a size limit)

### 4. Add "Re-scrape" feedback in BrandingTab

Currently there's no way to see what was scraped or retry easily with feedback.

**File**: `src/pages/admin/settings/BrandingTab.tsx`
- After scraping, show a live preview of the header/footer HTML in an iframe or sandboxed div
- Show a warning if the scraped header is very short (< 200 chars) suggesting the scrape may have been poor quality

### Files to modify

| File | Change |
|------|--------|
| `src/pages/storefront/StorefrontLanding.tsx` | Use facsimile header/footer when enabled |
| `src/index.css` | Fix CSS isolation to not break layout |
| `supabase/functions/scrape-branding/index.ts` | Better selector logic, resolve URLs, fetch external CSS |
| `src/pages/admin/settings/BrandingTab.tsx` | Preview + quality warning |
| `src/components/CustomerHeader.tsx` | Minor fix: ensure facsimile wrapper doesn't break flex layout |
| `src/components/CustomerFooter.tsx` | Same fix as header |
