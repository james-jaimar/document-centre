## Root cause

The DB is correct — `tenants.custom_domain = 'postnetprintcentre.com'` maps to the `postnet` tenant. The regression is purely frontend.

In the previous round I added a **4-second safety timeout** to `SubdomainWrapper` so a failed/slow `useTenantFromHost` lookup would stop blanking the app. That timeout flips `loading → false` while leaving `matched = false`. The route table then matches:

```tsx
{!matched && <Route path="/" element={<MarketingLanding />} />}
```

…and renders the Document Centre marketing landing at `https://postnetprintcentre.com/`. So when the Supabase REST call to `tenants?custom_domain=in.(postnetprintcentre.com)` is slow or fails (the console shows `TypeError: Failed to fetch` on Supabase REST), the user sees the wrong brand instead of the Postnet storefront.

### Did the Cloud Tasks retry logging change cause this?

No. Those edits are entirely server-side (`pdf-server/app/core/queue.py`, `tasks_routes.py`, `derived_files.py`, deploy workflow). They cannot reach the browser bundle.

What did affect the frontend was the **separate** "blank storefront" fix in the same message: the new 4 s timeout in `SubdomainWrapper`/`CustomerLayout` plus the `try/catch/finally` in `useTenantFromHost`. Together they convert "infinite spinner on tenant fetch failure" into "fall through to whatever route matches `matched=false`" — which on a custom domain is the Document Centre marketing page. The Cloud Tasks work happened in the same chat turn, which is why it looks correlated, but it isn't.

## Fix

1. **`src/lib/tenantUrl.ts`** — add `isPlatformHost(hostname)` returning true only for `document-centre.com`, `www.document-centre.com`, `localhost`, `127.0.0.1`, and `*.lovable.app` / `*.lovable.dev` / `*.jaimar.dev` (mirroring the skip-list in `useTenantFromHost`). Any other hostname is treated as a tenant host.

2. **`src/components/SubdomainRouter.tsx`** — compute `isPlatformHost` once at mount.
   - If we're on a tenant host (custom domain or subdomain), **never bail out to the marketing tree**. Keep showing the spinner while loading; if the lookup ultimately fails or returns no row, render a small inline "Storefront is loading…" / retry panel instead of falling through. No 4 s timeout for tenant hosts.
   - If we're on the platform host, keep the 4 s safety timeout (its original purpose: don't blank `document-centre.com`).

3. **`src/App.tsx`** — wrap the `<Route path="/" element={<MarketingLanding />} />` line with a check on `isPlatformHost(window.location.hostname)` as a second line of defence, so even a future regression cannot serve Document Centre branding on someone else's domain.

4. **`src/hooks/useTenantFromHost.ts`** — increase resilience for custom domains: do 3 retries with 250 ms / 750 ms / 1.5 s back-off (still inside `try/finally` so the spinner releases). Log a single `console.warn` on final failure. No behaviour change for platform hosts.

5. No backend, no migration, no pdf-server changes.

## Verification

- Reload `https://postnetprintcentre.com/` → must show the Postnet storefront (or a "Storefront loading…" panel if Supabase is genuinely down), never the Document Centre marketing site.
- Reload `https://document-centre.com/` → must still show `MarketingLanding`.
- Reload `/t/postnet` on the preview → unchanged.
- Block the Supabase tenants REST call in devtools and reload on a custom domain → see the loading/retry panel, not Document Centre.

## Scope

Pure frontend fix in 4 files. No DB writes, no edge-function changes, no pdf-server changes. The earlier `useTenantFromSlug` / `CustomerLayout` timeouts are kept as-is — they only affect the `/t/:slug` flow which is not the source of this incident.
