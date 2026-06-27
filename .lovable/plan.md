# Fix deep-link 404s on both Amplify domains

## What I confirmed (no guessing)

I curled both domains:

- `https://document-centre.com/branch/settings/` → **HTTP 404** (body 2817 bytes, served from S3 via CloudFront)
- `https://postnetprintcentre.com/branch/settings/` → **HTTP 404** (identical etag, same body)
- `https://postnetprintcentre.com/branch/settings` (no trailing slash) → **301** to `/branch/settings/` (then 404)

Both domains are attached to the same Amplify app (`document-centre`, main branch) — your first screenshot confirms it. They share the same Rewrites table, so whatever we fix here fixes both. **No CloudFront console work needed** — Amplify owns the CloudFront distribution under the hood.

## Why it's broken

Your current second rule is:

```
Source: /<*>     Target: /index.html     Type: 404 (Rewrite)
```

In Amplify, **type `404`** means "serve the target body but return HTTP **404** as the status". That's why the browser still renders the SPA shell (so the page often *looks* fine) but the response status is 404 — which is what shows up in the console, breaks crawlers, breaks `fetch()`-style health checks, and looks bad on hard refresh.

The standard SPA fallback needs **type `200` (Rewrite)** — same body, but status 200 so React Router takes over cleanly.

## The fix — 3 clicks in Amplify

In **Hosting → Rewrites and redirects → Manage redirects**:

1. **Keep** the existing logo rule exactly as-is (must stay first so logos aren't swallowed by the SPA rule):
   ```
   /logo/<*>  →  https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/tenant-logo/<*>   200 (Rewrite)
   ```
2. **Edit** the second rule (`/<*>` → `/index.html` `404`):
   - Source address: `</^[^.]+$|\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest)$)([^.]+$)/>`
   - Target address: `/index.html`
   - Type: **200 (Rewrite)**
3. **Save**.

The regex source excludes real asset extensions (so missing PNGs etc. still return real 404s instead of being masked by index.html) and catches every SPA path including ones with trailing slashes like `/branch/settings/`.

## How I'll verify (after you save)

I'll re-curl both URLs and confirm they return `HTTP/2 200` with the SPA HTML. If anything still 404s I'll dig further before changing anything else.

## What does NOT need to change

- No code edits in this repo.
- No `customHttp.yml` change (that's headers/CSP, not routing).
- No `vite.config.ts` change.
- No CloudFront distribution settings.
- No second Amplify app.
