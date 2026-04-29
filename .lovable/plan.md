# Phishing Flag Remediation Plan (Amplify-hosted)

## Context

- Production site: `document-centre.com` (GitHub → AWS Amplify)
- Lovable preview: `document-centre.lovable.app` (shared subdomain — almost certainly the source of the Google Safe Browsing flag)
- Custom domain on Lovable: `document-centre.jaimar.dev`

The phishing warning is most likely triggered by the shared `*.lovable.app` host plus a third-party chat widget loading on the login page. The fixes below clean up signals on both surfaces and add proper security headers on Amplify.

## What I'll change in code

### 1. Move Tawk.to chat off the login surface

- Remove the inline Tawk.to snippet from `index.html`.
- Add a new `src/components/ChatWidget.tsx` that injects the Tawk.to script only when mounted.
- Mount it from `src/components/CustomerLayout.tsx` and `src/pages/MarketingLanding.tsx` (and `Pricing`, `Contact`).
- Do NOT mount it on: `/auth`, `/auth/callback`, `/auth/verify`, `/reset-password`, `/try`, `/platform/*`, `/admin/*`, `/branch/*`.

Why: a third-party chat widget loaded on a login page is a classic phishing heuristic.

### 2. Remove sketchy CDN script from `Try.tsx`

- Audit `src/pages/Try.tsx` and remove any `cdn.jsdelivr.net/emojione` script tag (legacy, flagged on reputation lists). Replace with native emoji or a lucide icon if needed.

### 3. Add Amplify security headers via `customHttp.yml`

Create `customHttp.yml` at the repo root (Amplify reads this automatically on next build):

```yaml
customHeaders:
  - pattern: '**'
    headers:
      - key: 'Strict-Transport-Security'
        value: 'max-age=63072000; includeSubDomains; preload'
      - key: 'X-Content-Type-Options'
        value: 'nosniff'
      - key: 'X-Frame-Options'
        value: 'SAMEORIGIN'
      - key: 'Referrer-Policy'
        value: 'strict-origin-when-cross-origin'
      - key: 'Permissions-Policy'
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
      - key: 'Content-Security-Policy'
        value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://embed.tawk.to https://*.tawk.to; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://embed.tawk.to; font-src 'self' data: https://fonts.gstatic.com https://embed.tawk.to; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tawk.to wss://*.tawk.to https://document-centre.jaimar.dev https://srv1516161.hstgr.cloud; frame-src https://*.tawk.to; object-src 'none'; base-uri 'self'; form-action 'self'"
```

Stronger than `<meta>` CSP because it covers non-HTML responses too. CSP includes Tawk.to, Supabase, and your VPS API origin — I'll verify the exact VPS hostname from `documentCentreApi.ts` before finalising.

### 4. Tighten `index.html` meta

- Add `<meta name="referrer" content="strict-origin-when-cross-origin">` as a belt-and-braces fallback for the lovable.app preview (which doesn't get the Amplify headers).

## What you need to do (manual checklist)

These are infra/console clicks I can't do from the codebase:

1. **Make the lovable.app URL non-public**
   - Lovable → Project Settings → Publish → set visibility to **Private**, OR unpublish entirely.
   - Reason: kills the shared-subdomain reputation signal at the source. Your Amplify production stays untouched.

2. **Supabase Auth URLs** (Supabase dashboard → Authentication → URL Configuration)
   - Site URL: `https://document-centre.com`
   - Redirect URLs: keep only `https://document-centre.com/**` and (optionally) `https://document-centre.jaimar.dev/**`
   - Remove any `*.lovable.app` entries.

3. **Google Search Console**
   - Add `document-centre.com` as a property (if not already).
   - Security Issues → Request Review, noting that the chat widget has been removed from auth pages and CSP is now enforced.
   - If the flag is on `document-centre.lovable.app`, you'd need to verify that property too — but if you've unpublished it (step 1) the warning becomes moot.

4. **Amplify build**
   - After I commit `customHttp.yml`, the next Amplify build picks it up automatically. Verify headers via `curl -I https://document-centre.com` after deploy.

## Out of scope (not changing)

- Pipeline / preview / PDF performance work — already deployed last round.
- Auth flow logic — `AuthCallback.tsx` and `Try.tsx` business logic stays as-is; we're only cleaning third-party scripts.

## Files I'll touch

- `index.html` — remove Tawk.to inline, add referrer meta
- `src/components/ChatWidget.tsx` — new
- `src/components/CustomerLayout.tsx` — mount ChatWidget
- `src/pages/MarketingLanding.tsx`, `src/pages/Pricing.tsx`, `src/pages/Contact.tsx` — mount ChatWidget
- `src/pages/Try.tsx` — strip emojione CDN script if present
- `customHttp.yml` — new (Amplify headers)

After approval I'll implement, then give you the curl command to confirm headers landed on `document-centre.com` post-deploy.
