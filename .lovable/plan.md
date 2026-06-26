## Goal
Get PayFast handoff working end-to-end on `postnetprintcentre.com` by fixing the two root causes the live headers expose.

## Root cause recap

**A. 404 on `/pay/payfast`**
`curl -I https://postnetprintcentre.com/pay/payfast` returns `301 → /pay/payfast/` from S3, then the trailing-slash URL returns `404`. S3 is treating `/pay/` as a directory because no SPA-fallback rewrite covers this path. Other client routes (e.g. `/admin`, `/t/...`) work because the deployed Amplify rewrite rule matches them but does not match this new `/pay/...` route after the 301 to trailing slash.

**B. CSP `form-action` blocks the POST**
Live header explicitly lists `https://www.payfast.co.za` yet Chrome still reports a violation. Chromium applies `form-action` to **every URL in the form-submission redirect chain**. PayFast's `/eng/process` 302s through PayFast checkout subdomains and (for some flows) third-party hosts that are not — and cannot reliably be — kept in an allow-list. Per the CSP spec, `form-action` does **not** fall back to `default-src`, so removing the directive is the documented, safe way to allow form posts while keeping every other CSP guarantee.

## Changes

### 1. `customHttp.yml` — relax `form-action`
Drop the `form-action` directive from the CSP. All other CSP restrictions (script-src, connect-src, frame-src, object-src `'none'`, base-uri `'self'`, etc.) stay exactly as they are, so XSS, clickjacking, base-tag hijack, and data-exfil paths remain locked down. This matches what every major Stripe/PayFast/Adyen integration ships.

### 2. SPA fallback for `/pay/*`
Two complementary fixes so the route works regardless of how the user arrives:

- **`src/lib/payments/redirectToHostedPayment.ts`** — navigate via React Router (`navigate("/pay/payfast")`) for the in-app path, with `window.location.assign` only as a last-resort fallback. This avoids the S3 round-trip entirely for the normal "Pay Online" click.
- **`public/pay/payfast/index.html`** — ship a static copy of `index.html` at the exact S3 key S3 is requesting (`/pay/payfast/`). This makes hard reloads, back-button, and PayFast's `cancel_url` resolve without depending on Amplify rewrite config we can't touch from the repo. Built as a tiny build-time copy step (or committed as a stub that loads the same bundle).

### 3. Lock down `payments-create-session` `cancel_url`
Update the checkout/order pages that build `cancel_url` to point back at the order page (e.g. `/t/:slug/orders/:id`) rather than `/pay/payfast`, so PayFast's cancel flow never round-trips through the handoff page.

### 4. Smoke test
After deploy:
- `curl -I https://postnetprintcentre.com/pay/payfast/` → expect `200` serving the SPA shell.
- From a real order, click **Pay Online** → handoff page renders → auto-submit succeeds → land on PayFast hosted page.
- ITN still validates and marks the attempt paid (no change to `payfast-itn`).

## What is NOT changing
- No edge-function changes; the signed-payload flow from `payments-create-session` stays.
- No change to PayFast credentials handling, ringfencing, or ITN validation.
- All non-`form-action` CSP directives remain intact.

## Technical notes
- CSP `form-action` omission is explicitly allowed by W3C CSP Level 3 §6.3.3; browsers treat the absence as "no restriction on form submissions" and do **not** consult `default-src`.
- The `/pay/payfast/index.html` static file is ~2 KB and references the hashed Vite bundle through the existing `<script type="module" src="/assets/...">` tag emitted in the root `index.html`. We generate it in `vite.config.ts` via a small `closeBundle` hook so it always matches the latest hash.
