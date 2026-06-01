## Why document-centre.com is blank

- `document-centre.com` is the **platform marketing site**, not a tenant.
- In `src/App.tsx`, the root route `/` is only registered when `useSubdomainTenant().matched === true` (a tenant whose `custom_domain` matches the current host).
- For document-centre.com, no tenant row matches, so `matched` is `false`, the `/` block is skipped, and no route matches `/` — React Router renders nothing (blank). Console confirms: `No routes matched location "/"`.
- `MarketingLanding` is already imported in `App.tsx` but never attached to a route.

## Fix

In `src/AppRoutes` (`src/App.tsx`):

1. When `matched` is **false** (i.e. we're on the platform host, not a tenant host), register:
   - `<Route path="/" element={<MarketingLanding />} />`
2. Keep the existing `matched === true` branch unchanged so tenant custom domains continue to render `CustomerLayout` at `/`.
3. Add a final catch-all so any unknown path renders the existing `NotFound` page instead of going blank:
   - `<Route path="*" element={<NotFound />} />` (import from `@/pages/NotFound`, which already exists).

That's all — no DB, edge function, or styling changes. The marketing page itself (`MarketingLanding.tsx`) is already built and uses the `dc-marketing` brand tokens.

## Files touched

- `src/App.tsx` — add two `<Route>` lines and (if not already imported) `import NotFound from "@/pages/NotFound"`.

## Verification after build

- Visit `https://document-centre.com/` → marketing landing renders.
- Visit a tenant custom domain → still renders `CustomerLayout` (unchanged path).
- Visit `https://document-centre.com/some-bogus-url` → `NotFound` page instead of blank.
