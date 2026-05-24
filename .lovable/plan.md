# Launch postnetprintcentre.com for Postnet

You've registered `postnetprintcentre.com`. The app already supports custom-domain tenant resolution (`useTenantFromHost` → `tenants.custom_domain`), so no fork is needed — the same codebase serves both `document-centre.com` and the new domain.

## What needs to happen

### 1. DNS (at the registrar)
- `A` record `@` → `185.158.133.1` (or follow Amplify's instructions if you're routing via Amplify rather than Lovable hosting — confirm which is authoritative for production)
- `A` / `CNAME` `www` → same target
- Add `www.postnetprintcentre.com` redirect to apex (or vice versa) — pick a primary

### 2. Hosting (AWS Amplify, per your prod setup)
- Add `postnetprintcentre.com` + `www.postnetprintcentre.com` as alternate domains on the same Amplify app that serves `document-centre.com`
- Let Amplify provision SSL for both

### 3. Database
- Set `tenants.custom_domain = 'postnetprintcentre.com'` on the Postnet tenant row (via the existing **Admin → Settings → Domains** tab — no migration needed)

### 4. Supabase Auth
- Add `https://postnetprintcentre.com/**` and `https://www.postnetprintcentre.com/**` to allowed redirect URLs
- Add the same as allowed Site URLs for password reset / magic links

### 5. Code audit + small fixes
There are a handful of places that assume `document-centre.com`. I'll audit and patch:

- **`src/hooks/useTenantFromHost.ts`** — already handles custom domains correctly. No change.
- **`src/lib/tenantUrl.ts` / `useTenantSlug`** — on a custom domain there's no `/t/:slug` prefix, so branch URLs become `postnetprintcentre.com/sandtoncity/...`. Need to smoke-test `parseTenantPath` isn't called on these (it's only used inside `/t/` redirects, so should be fine — but I'll verify `ProtectedRoute`, `AuthCallback`, `landingRoute`).
- **`supabase/functions/_shared/buildAuthLink.ts`** — already resolves origin from tenant `branding.portal_url`. Set Postnet's `portal_url` setting to `https://postnetprintcentre.com` so auth emails link to the right host.
- **`supabase/functions/verify-domain/index.ts`** — hard-codes `"document-centre.com"` as the CNAME match. Either harmless (Amplify-based verification differs) or worth generalising; I'll review.
- **Tenant facsimile header/footer scraping** — confirm Postnet's scraped header still works when served from the new origin (CORS / image URLs).
- **Sender domain** — Postnet's transactional email "from" needs updating to use `@postnetprintcentre.com` (requires a verified email domain in the email tool; separate task).
- **Meta tags, OG images, sitemap, robots.txt** — currently reference `document-centre.com`. Make tenant-aware on custom domains.

### 6. Smoke tests after go-live
- `https://postnetprintcentre.com` → Postnet landing (not Document Centre)
- `https://postnetprintcentre.com/sandtoncity` → branch picker / branch home
- Upload + bound-document flow end-to-end
- Sign-up → email link points back to `postnetprintcentre.com` (not document-centre.com)
- Password reset same
- Checkout payment redirect returns to correct host

## Recommended order

1. You: register DNS + add domain in Amplify (I can't do this for you)
2. Me: audit + patch the code references above (small PR)
3. You: set `custom_domain` + `portal_url` in Postnet admin
4. You: add Supabase Auth redirect URLs
5. Both: smoke test

## Out of scope for this plan
- Forking the app (explicitly not recommended)
- Email sender domain verification — separate flow once DNS is live
- Marketing site content for postnetprintcentre.com (currently the storefront IS the landing — confirm whether you want a separate marketing page)

Want me to proceed in build mode with step 2 (the code audit + patches)?