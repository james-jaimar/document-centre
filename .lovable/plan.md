## What broke

After cutting `document-centre.com` over to AWS Amplify, the `customHttp.yml` CSP header is now actually being enforced in production. The CSP's `connect-src` directive does not include the S3 host, so every browser → S3 presigned-URL `PUT` is blocked before it leaves the page:

> Refused to connect because it violates the document's Content Security Policy.

`s3Storage.ts` then sees this as a "Failed to fetch" network error and burns through all 6 retries + a re-sign + 1 more retry, all of which are doomed — CSP kills each attempt identically.

A second class of CSP noise is also showing up because the Tawk widget pulls scripts/sockets from `cdn.jsdelivr.net` and a couple of non-`*.tawk.to` hosts.

## Fix

Edit **`customHttp.yml`** — the only file that needs to change. After Amplify redeploys (auto on git push), the new CSP header is served and uploads work again.

### 1. `connect-src` — add S3

Append the S3 host so the browser allows fetch/XHR to presigned URLs. Use a wildcard so future region or bucket-style changes don't break things again:

```
https://*.s3.af-south-1.amazonaws.com https://s3.af-south-1.amazonaws.com
```

(Both forms are needed because presigned URLs use the path-style `s3.<region>.amazonaws.com/<bucket>/<key>` host, and some SDKs/clients shift to virtual-hosted-style `<bucket>.s3.<region>.amazonaws.com/<key>`. Belt and braces.)

### 2. `script-src` — add jsdelivr for Tawk emoji

```
https://cdn.jsdelivr.net
```

### 3. `connect-src` — add the rest of Tawk's hosts

The masked `<URL>` entries in the log are Tawk's analytics/realtime endpoints. The safest minimal addition is to allow Tawk's CDN and the WSS upgrade host:

```
https://*.jsdelivr.net wss://*.tawk.to
```

(`wss://*.tawk.to` is already there — keep. Add jsdelivr because Tawk also pulls runtime chunks from it.)

### Final `customHttp.yml` CSP (single line, unchanged structure)

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://embed.tawk.to https://*.tawk.to https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://embed.tawk.to https://*.tawk.to;
font-src 'self' data: https://fonts.gstatic.com https://embed.tawk.to https://*.tawk.to;
img-src 'self' data: blob: https:;
media-src 'self' blob: https:;
worker-src 'self' blob:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tawk.to wss://*.tawk.to https://cdn.jsdelivr.net https://*.s3.af-south-1.amazonaws.com https://s3.af-south-1.amazonaws.com;
frame-src https://*.tawk.to;
object-src 'none';
base-uri 'self';
form-action 'self'
```

Everything else (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) stays exactly as-is.

## Why no code/edge-function changes

- `s3Storage.ts` retry logic is doing its job — it correctly classifies "Failed to fetch" as transient. The bug isn't there; we just shouldn't be giving it CSP-blocked requests to retry.
- The presigned URL itself is valid (correct signature, 15-min TTL, right region/bucket). You can confirm by `curl`ing the URL from the terminal — it'll succeed. Only the *browser* enforces CSP.
- No Supabase / edge function changes needed.

## How to verify after deploy

1. Hard refresh `document-centre.com` (CSP is cached aggressively — Cmd+Shift+R or open in private window).
2. Try uploading `8pp_A4.pdf` again on a customer order.
3. Console should show the single `[s3-storage] (ref: …) action=sign-upload` line and **no** "Refused to connect" entries.
4. The Tawk emoji picker should also stop complaining.

## Out of scope (flagged for later, not doing now)

- **Unpublish `document-centre.lovable.app`** — old Lovable Published URL still listed. Harmless but should be retired so the only production surface is Amplify on `document-centre.com`.
- **Tighten `script-src 'unsafe-inline' 'unsafe-eval'`** — currently needed by Tawk and Vite runtime; can be replaced with nonces in a later pass if you want a stricter CSP grade.
