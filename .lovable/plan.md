I agree: the current “facsimile” approach is the wrong shape. It is trying to inject another website’s header, footer, and Bootstrap/theme CSS into our React app, and that will keep fighting the app layout. I’ll replace it with a safer tenant-branding model that keeps the Document Centre print flow intact and only lets tenant branding skin it.

Plan:

1. Make `/t/:slug` use the same experience as `/try`
   - Keep `/try` as the demo entry that signs in anonymously and redirects to `/t/demo/print-centre`.
   - Make tenant storefronts (`/t/postnet`, `/t/:slug/print-centre`) show the same `CustomerLayout` + `CustomerDashboard` print-centre flow, not a separate facsimile landing page.
   - Remove/stop using `StorefrontLanding` for tenant portals so there is only one customer-facing print-centre experience.

2. Remove scraped CSS injection from customer pages
   - Stop rendering tenant `header_css` / `footer_css` into live `<style>` tags in `CustomerHeader`, `CustomerFooter`, and the landing page path.
   - Remove the `all: initial` facsimile resets from `index.css` because they are currently part of the layout breakage.
   - Keep `header_html` / `footer_html` stored for now if it exists, but do not inject it into the live customer portal.

3. Replace facsimile header/footer with controlled branded shell components
   - `CustomerHeader` becomes a Document-Centre-controlled header with tenant branding applied:
     - tenant logo
     - tenant portal name
     - tenant colours
     - normal app navigation: Home, Create, Cart, Orders, Account / Sign In
     - optional “Back to tenant site” link using `origin_url`
   - `CustomerFooter` becomes a controlled footer with:
     - tenant logo/name
     - support email/phone
     - Terms / Privacy
     - optional “Back to tenant site”
     - “Powered by Document Centre” when appropriate
   - No arbitrary scraped HTML/CSS can cover or overwrite the page.

4. Apply tenant colour scheme safely through CSS variables
   - Continue using tenant `primary_color`, `secondary_color`, and `accent_color`, but only as CSS variables set by `CustomerLayout`.
   - Extend these variables to header, sidebar, CTA buttons, product tiles, active nav states, and upload highlights.
   - Add font support from `font_heading` / `font_body` as safe font-family strings on the tenant shell, not by importing arbitrary external CSS.

5. Simplify the Branding admin tab
   - Change the wording from “Website Header & Footer” / “facsimile” to “Tenant Brand”.
   - Keep “Import from Website” for extracting logo/colours/name/tagline.
   - Remove or de-emphasise “Scrape Header & Footer” as a live portal feature.
   - If keeping the scrape tool for reference, label it as “Reference only / not rendered live” so admins do not expect a full website clone.
   - Add preview copy that explains: tenant branding replaces the portal header/footer and colour scheme, while the print ordering UI remains Document Centre.

6. Add a defensive fallback for existing bad PostNet data
   - Treat `facsimile_enabled` as ignored/deprecated in customer rendering.
   - Existing saved PostNet `header_html`/`header_css` can remain in the database without breaking the page because customer pages will no longer inject it.
   - Optionally add a small migration to mark `facsimile_enabled` false for existing tenants to reflect the new model, but the code will be safe either way.

Technical details:

- Files to update:
  - `src/components/CustomerHeader.tsx`
  - `src/components/CustomerFooter.tsx`
  - `src/components/CustomerLayout.tsx`
  - `src/index.css`
  - `src/pages/admin/settings/BrandingTab.tsx`
  - likely remove unused imports/usages of `scopeCss` and possibly retire `src/pages/storefront/StorefrontLanding.tsx` / `src/lib/scopeCss.ts` if no longer referenced.
- Routing stays under the existing public customer route:
  - `/t/:slug`
  - `/t/:slug/print-centre`
  - `/t/:slug/orders/new`
  - auth only at checkout / account / order history as already intended.
- I will not add any backend server. If a DB migration is used, it will only clean/deprecate the existing facsimile flag; no sensitive data or role changes are involved.

Expected result:

- `/t/postnet` shows the same working print-centre layout as `/try`, with PostNet logo/colours/name applied.
- Product tiles and upload flow stay visible and functional.
- Tenant branding cannot overwrite the whole page anymore because no tenant-provided CSS/HTML is injected into the live portal.