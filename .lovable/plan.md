## Goal

The current marketing email wraps every link in `https://<project>.supabase.co/functions/v1/email-track?t=...`. That looks like a phishing payload to a branch owner and kills click-through. Fix the tracking transport, trim the footer, and add a hero visual so the email visibly says "web-to-print".

## 1. Kill the Supabase-looking tracking URLs

Two parts to the problem:

- **Click tracking** rewrites every `<a href>` into `…supabase.co/functions/v1/email-track?t=<long token>`. This is the scary one — visible in the hover tooltip.
- **Open tracking** loads a 1×1 pixel from the same `…supabase.co/functions/v1/email-track?t=…` URL. Less visible but still leaks the Supabase host into "view source" and some clients show it.

Approach:

a. **Route tracking through the tenant's own domain.** Add a public app route `/e/o/:token` (open pixel) and `/e/c/:token` (click redirect) on the storefront app, served from whatever host the recipient already trusts — `postnetprintcentre.com` for PostNet, `document-centre.com` otherwise. The route is a thin proxy that calls the existing `email-track` edge function server-side and returns the GIF / 302 to the browser. Hover tooltip then reads `https://postnetprintcentre.com/e/c/<token>` — same domain as the activation link, no Supabase string anywhere.

b. **For the marketing template specifically, drop click tracking entirely** and only keep the open pixel. Marketing has exactly one real CTA (the activation link) and that click is already logged server-side when the recipient lands on `/activate/<slug>` and self-confirms — we don't need to wrap it. This means every `<a href>` in the marketing email is a plain, direct URL. Transactional emails can keep click tracking via the new domain-proxied route.

c. **Resolve the proxy host per recipient** using the same `resolveAppOriginDetailed(tenant_id, …)` helper already used for activation links, so PostNet branches get `postnetprintcentre.com` and other tenants get their own custom domain (falling back to `document-centre.com`).

Technical notes:
- `supabase/functions/_shared/emailTracking.ts` currently hard-codes the Supabase functions origin when building tracked URLs. Change `injectTracking()` to take a `trackingOrigin` argument and emit `${trackingOrigin}/e/o/<token>` / `${trackingOrigin}/e/c/<token>`.
- `supabase/functions/send-branch-marketing-campaign/index.ts` stops calling `injectTracking` for `<a>` rewriting; it only injects the open pixel (also via the tenant origin). All `{{activation_link}}` and any other URLs render as-is.
- New SPA route `/e/o/:token` and `/e/c/:token` in `src/App.tsx`, backed by tiny components that `fetch` the existing `email-track` edge function and then either render a blank pixel response or `window.location.replace(target)`. Pixel route can be a server-rendered fallback — for an SPA we can just hit the edge function from a small loader; the open is still logged. (If we want a true `<img>` GET with no JS, we can add a Cloudflare/Amplify rewrite later, but the JS pixel works for the HTML email because clients fetch the `<img>` from their own renderer, not the SPA. To keep the open pixel a real image GET, the cleanest option is an Amplify/Cloudfront URL rewrite from `/e/o/*` → the edge function; flag this as a small follow-up if rewrites aren't available, and in the interim point the pixel at `${appOrigin}/e/o.gif?t=…` served via the same proxy.)

## 2. Clean up the marketing footer

In `supabase/functions/_shared/branded-shell.ts` (the `renderBrandedEmail` shell), the footer currently appends Privacy / Terms / unsubscribe links. For `kind = "marketing"` campaigns:

- Remove the Privacy and Terms links.
- Keep a single, plain-text unsubscribe line (legally required for cold-ish B2B outreach) pointing to the same tenant-domain route, e.g. `postnetprintcentre.com/u/<token>` — no Supabase URL.
- Keep the small "Document Centre — Web-to-Print SaaS" sign-off line.

Transactional emails are unchanged.

## 3. Add a hero image

- Generate one polished hero image (web-to-print themed — laptop/phone showing a print order being built, neutral palette that works for any tenant). Save under `src/assets/marketing/hero-web-to-print.jpg` and upload to a public bucket so it has a stable CDN URL usable in email (`<img>` in email cannot be a Vite import).
- Inject it at the top of the marketing email body inside `renderBrandedEmail`, above the heading, max-width 600px, with proper `alt`, explicit width/height, and a fallback background colour so Outlook's "block images" state still looks OK.
- Store the URL in `platform_settings` (key `marketing_hero_image_url`) so it can be swapped later without a redeploy. Fall back to a bundled default if unset.

Optional follow-up (not in this plan unless you want it now): allow per-template hero override on `platform_email_templates`.

## 4. Verify

- Send a dry-run to the Demo2 branch and confirm in the returned `activation_link` and rendered HTML preview that:
  - Every `<a href>` is either `https://postnetprintcentre.com/…` or `https://document-centre.com/…` — no `supabase.co` anywhere.
  - Footer has no Privacy/Terms links.
  - Hero image renders.
- Send a real test to `admin@jaimar.dev`, open in Outlook, hover every link, confirm tooltips show the tenant domain only.

## Files likely touched

- `supabase/functions/_shared/emailTracking.ts` — accept `trackingOrigin`, build URLs on it.
- `supabase/functions/_shared/branded-shell.ts` — marketing footer variant, hero image slot.
- `supabase/functions/send-branch-marketing-campaign/index.ts` — pass tenant origin, skip click rewriting, inject hero URL.
- `src/App.tsx` + new `src/pages/email/TrackOpen.tsx` / `TrackClick.tsx` — public proxy routes.
- `src/assets/marketing/hero-web-to-print.jpg` (generated) + upload to public bucket.
- `platform_settings` row for `marketing_hero_image_url`.

No DB schema change. No change to the activation page or demo gate.
