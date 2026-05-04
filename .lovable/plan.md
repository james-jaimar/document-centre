## Problem

The scraped PostNet CSS (Bootstrap + custom styles) is injected as a global `<style>` tag in `CustomerHeader.tsx` line 151. This CSS contains selectors like `body`, `*`, `.container`, `.d-flex`, etc. that override the entire page layout — not just the facsimile header. The result: the page renders the PostNet header fragment but all content below is invisible or broken.

The same issue exists in `CustomerFooter.tsx` for the facsimile footer CSS.

## Fix

**Scope all facsimile CSS** by prefixing every rule with `.facsimile-header` (or `.facsimile-footer`) so the scraped styles cannot leak. Two approaches:

### Approach: CSS `@scope` with prefix fallback

Wrap the injected CSS in a scoping function that prepends `.facsimile-header ` to every CSS rule selector. This is done at render time by parsing the raw CSS string and rewriting selectors.

### Changes

1. **Create `src/lib/scopeCss.ts`** — a utility function that takes raw CSS text and a scope selector (e.g. `.facsimile-header`), and returns CSS with every rule prefixed. It handles:
   - Regular rules: `.container { ... }` becomes `.facsimile-header .container { ... }`
   - Body/html selectors: `body { ... }` becomes `.facsimile-header { ... }`
   - `@font-face` and `@keyframes` blocks are passed through unchanged
   - `@media` blocks are recursively scoped

2. **Update `CustomerHeader.tsx`** (line ~151) — replace the raw CSS injection with the scoped version:
   ```
   const scopedCss = scopeCss(branding.header_css, '.facsimile-header');
   ```

3. **Update `CustomerFooter.tsx`** — same treatment for `footer_css`, scoped to `.facsimile-footer`.

4. **Update `StorefrontLanding.tsx`** — same treatment for header/footer CSS used on the landing page.

This ensures all scraped tenant CSS is sandboxed within the facsimile container elements and cannot affect product tiles, navigation, or any other page content.
