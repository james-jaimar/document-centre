
# Seamless Tenant Header/Footer Facsimile

## Concept

When a customer visits `onlineprint.postnet.co.za` (CNAME to `postnet.document-centre.com`), they see a header and footer that looks identical to Postnet's real website. All links in the facsimile are disabled/removed except a single "Back to [tenant].co.za" link. The customer never feels like they left the tenant's site.

## What Changes

### 1. Enhanced `scrape-branding` Edge Function

The current scrape only extracts colours/logos/fonts. We'll extend it to also capture:

- **Header HTML** — the `<header>`, `<nav>`, or top-of-page navigation block
- **Footer HTML** — the `<footer>` or bottom-of-page block
- **Associated CSS** — computed styles for the header/footer elements, inlined
- **Logo and images** — re-uploaded to our S3/storage so they don't break if the tenant changes theirs

The scraping approach:
- Use Firecrawl's `html` format to get the full rendered page
- Server-side: parse the HTML with a DOM parser, extract `<header>` and `<footer>` elements
- Strip all `<a href>` links (replace with `<span>` or dead links) except one designated "back to site" link
- Strip all `<script>` tags and event handlers (security)
- Inline critical CSS so the facsimile renders standalone
- Store the sanitised HTML blobs

### 2. New Branding Settings Keys

Add to `tenant_settings` (category: `branding`):

| Key | Type | Description |
|-----|------|-------------|
| `header_html` | string | Sanitised HTML for the header facsimile |
| `footer_html` | string | Sanitised HTML for the footer facsimile |
| `header_css` | string | Scoped CSS for the header |
| `footer_css` | string | Scoped CSS for the footer |
| `origin_url` | string | The tenant's real website URL (for the "back" link) |
| `facsimile_enabled` | boolean | Toggle to use facsimile vs default branding header |

No schema migration needed — `tenant_settings` is already a flexible key/value store.

### 3. BrandingTab UI Update

Add a new card section "Website Header & Footer" to the admin branding settings:

- Input field for the tenant's website URL
- "Scrape Header/Footer" button that calls the enhanced edge function
- Preview of the scraped header and footer HTML
- Toggle: "Use website header/footer" (facsimile_enabled)
- Manual HTML editor (optional, for tweaking the scraped result)
- The "back to site" link URL (auto-populated from origin_url)

### 4. CustomerHeader / CustomerFooter — Facsimile Mode

When `facsimile_enabled` is true for the tenant:

- **CustomerHeader**: Instead of rendering our nav bar, render the `header_html` inside a scoped container (e.g. `<div class="facsimile-header" dangerouslySetInnerHTML>`) plus our own minimal internal nav (Home, Orders, Cart, Account) as a slim secondary bar below it
- **CustomerFooter**: Render `footer_html` in a scoped container, with "Powered by Document Centre" retained
- All tenant HTML is sandboxed via scoped CSS class prefixing to prevent style leaks
- Our internal navigation (the slim bar) remains functional

When `facsimile_enabled` is false, everything works exactly as it does today.

### 5. `useTenantBranding` Hook Extension

Add `header_html`, `footer_html`, `header_css`, `footer_css`, `origin_url`, and `facsimile_enabled` to the `TenantBranding` interface and query.

### 6. Security Considerations

- All scraped HTML is sanitised server-side (strip scripts, event handlers, iframes, forms)
- Use DOMPurify or equivalent on the server edge function
- CSS is scoped under a `.facsimile-header` / `.facsimile-footer` wrapper to prevent global style pollution
- `dangerouslySetInnerHTML` is acceptable here because content is admin-controlled and server-sanitised

## Architecture Flow

```text
Admin enters tenant website URL
        │
        ▼
scrape-branding edge function
  ├─ Firecrawl fetches full HTML
  ├─ Parse DOM, extract <header> + <footer>
  ├─ Strip links, scripts, forms
  ├─ Inline computed CSS
  ├─ Scope CSS under .facsimile-*
  └─ Return sanitised blobs
        │
        ▼
Admin previews + saves to tenant_settings
        │
        ▼
Customer visits onlineprint.postnet.co.za
  ├─ CNAME → postnet.document-centre.com
  ├─ useTenantBranding loads facsimile HTML
  ├─ CustomerHeader renders scraped header
  │   + slim internal nav bar below
  └─ CustomerFooter renders scraped footer
      + "Powered by Document Centre"
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/scrape-branding/index.ts` | Extend to extract/sanitise header+footer HTML |
| `src/hooks/useTenantBranding.ts` | Add facsimile fields to interface and query |
| `src/pages/admin/settings/BrandingTab.tsx` | Add header/footer scrape UI section |
| `src/components/CustomerHeader.tsx` | Facsimile mode rendering |
| `src/components/CustomerFooter.tsx` | Facsimile mode rendering |
| `src/index.css` | Scoped `.facsimile-header` / `.facsimile-footer` base styles |
