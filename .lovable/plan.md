# Custom Domain Audit — postnetprintcentre.com

Great news that the storefront, branches, upload, cart and checkout all worked first try on the new domain. The custom-domain plumbing (`useTenantFromHost` → `tenants.custom_domain`, storefront RLS header, branch URL builder) is doing its job.

Below is a thorough sweep of remaining hard-coded `document-centre.com` references and what to do about each. Everything is small and surgical — no architecture changes.

## 1. Google OAuth still returns to Document Centre (highest priority)

This is **not a code bug** — `SocialAuthButtons` already passes `redirectTo: ${window.location.origin}/auth/callback`, which would correctly be `https://postnetprintcentre.com/auth/callback`. The reason Google bounces back to `document-centre.com` is the Supabase Auth URL config.

**Fix — Supabase dashboard (you, not code):**
- Auth → URL Configuration → **Additional Redirect URLs**: add
  - `https://postnetprintcentre.com/**`
  - `https://www.postnetprintcentre.com/**`
- Google Cloud Console → OAuth Client → Authorized JavaScript origins: add both as well (so Google's domain-validation step accepts the request).
- Site URL can stay as `https://document-centre.com` (it's only a default).

No code change needed. After this, Google sign-in will land back on the Postnet domain.

## 2. SEO tags hard-coded to document-centre.com

`index.html` lines 19, 24 set `<link rel="canonical">` and `<meta property="og:url">` to `https://document-centre.com/`. On the Postnet domain these tell crawlers and social previewers the canonical URL is the wrong site — bad for SEO and link unfurls.

**Fix:** small inline script in `index.html` `<head>` that rewrites both tags to `window.location.origin + window.location.pathname` at runtime. One-liner, runs before paint, no framework needed.

## 3. CustomerFooter "Powered by Document Centre" link

`src/components/CustomerFooter.tsx:97-104` shows a "Powered by Document Centre" link on every tenant portal footer. On Postnet's white-labelled domain this is probably **not** what you want customers to see.

**Two options — pick one in the plan review:**
- A. Hide it entirely when running on a custom domain (detect via `window.location.hostname !== 'document-centre.com'` and not a `*.document-centre.com` subdomain).
- B. Keep showing it but make it a tenant setting (`branding.show_powered_by`, default false for custom domains, true for platform subdomains).

I'd recommend **A** for the Postnet launch — keeps the white-label promise clean.

## 4. Things that are fine as-is (documenting the audit, no action)

- `useTenantFromHost.ts` — uses `document-centre.com` correctly as the platform subdomain root; custom domains fall through to the `tenants.custom_domain` lookup.
- `verify-domain/index.ts` — already updated last round to a flexible `PLATFORM_HOSTS` list.
- `buildAuthLink.ts` / `request-signup` / `request-password-reset` — already use `resolveAppOrigin(tenant_id, callerOrigin)`, which falls back to caller origin when no tenant `portal_url` is set. Postnet will get the right URL automatically.
- `submit-contact`, `Contact.tsx`, `MarketingLanding.tsx`, `PrivacyPolicy.tsx`, `TermsOfService.tsx` — these are the **Document Centre marketing site** pages (not the tenant portal). They legitimately reference DC's own email addresses.
- `branded-shell.ts` (`hello@document-centre.com`) — used for DC platform notifications, not tenant transactional email. Tenant email goes through `send-order-email` with tenant branding.
- `PlatformTenants.tsx:299` — admin-only helper text, fine.
- `EmailAccountsTab.tsx:263` — admin help string, fine.
- `useCart.ts:699` — synthetic demo email domain, never sent, fine.
- `sitemap.xml` / `robots.txt` — these are DC's own marketing-site SEO files. Tenant portals don't need their own at this stage; if you want one per tenant later, that's a separate piece of work.
- `customer_demo: @demo.document-centre.com` — internal, fine.

## 5. Operational checklist (Postnet tenant, no code)

For completeness, the manual steps that go alongside the code patches:

1. Admin → Settings → Domains on Postnet tenant: confirm `custom_domain = postnetprintcentre.com` is set and verified.
2. Admin → Settings → Branding on Postnet: set `portal_url = https://postnetprintcentre.com` so password-reset / set-password emails generate links on the Postnet domain even when triggered server-side (where there's no caller origin).
3. Supabase Auth → URL Configuration: add the two Postnet `**` redirect URLs (see §1).
4. Google Cloud Console OAuth client: add Postnet JS origin (see §1).
5. Sender domain for Postnet transactional email — `noreply@postnetprintcentre.com` will need DNS (SPF/DKIM/DMARC) before it'll send cleanly. Out of scope for this PR; treat as a follow-up.

## Code changes summary (when you approve)

- `index.html` — runtime rewrite of `canonical` + `og:url` to current origin.
- `src/components/CustomerFooter.tsx` — hide "Powered by" link on non-platform hostnames (option A above unless you say otherwise).

That's the whole code diff. Everything else is config in Supabase / Google.

## Out of scope

- Forking the app (we decided against)
- Per-tenant sitemap/robots
- Postnet sender-domain verification (separate task once you decide on the from address)
- Migrating `PlatformTenants.tsx` admin helper text (cosmetic only)

Want me to go ahead with code change §2 + option A for §3, then you handle the Supabase/Google console steps from §1 + §5?
