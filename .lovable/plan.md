
## Problem

On `/t/postnet/...` (and any tenant portal), users briefly see the default Document Centre look — dark sidebar, generic "My Print Centre" heading, no logo — before the red PostNet branding overlays in. On a slow connection it's a very visible flash.

Root cause is in `src/components/CustomerLayout.tsx`. The splash that's meant to hide this only fires while branding is loading, but the gate is:

```
const brandingReady = !tenant?.id || !brandingLoading;
```

On a fresh page load, `useTenantFromSlug` is still fetching, so `tenant?.id` is `null` → `brandingReady` evaluates to `true` → the splash is skipped → the unbranded layout renders with default sidebar/header colours. Branding paints in only once the second query (tenant settings) resolves.

The Auth page (`/t/:slug/auth`) has the same issue at a smaller scale — `brandedTenant` and `branding` both arrive after first paint, so the card shows the generic gradient + Printer icon before swapping to the tenant logo/colour.

## Fix

Three layers — each one shortens the gap further.

### 1. Gate the splash on the tenant fetch too

In `CustomerLayout.tsx`:

- Pull `loading` out of `useTenantFromSlug` (rename locally to `tenantLoading`).
- Recompute readiness so the splash also covers the tenant lookup itself:

```
const brandingReady = !slug || (!tenantLoading && !brandingLoading);
```

That alone removes the dark-sidebar/"My Print Centre" flash on first paint when a tenant slug is in the URL — the layout simply doesn't render until both queries have resolved.

### 2. Cache branding in `localStorage` per slug

Return visits and post-login navigations should paint branded on the very first frame, with no spinner at all.

- In `useTenantBranding`, before the React Query fetch, read `localStorage` key `tenant_branding:{slug-or-id}` as `initialData`. React Query will hydrate instantly, then revalidate in the background.
- After a successful fetch, write the resolved branding back to `localStorage`.
- In `useTenantFromSlug`, do the same for the small tenant record (id, name, logo_url) under `tenant:{slug}` so the splash logo + name are also instant.
- Cache TTL: 7 days (cheap to rebuild, safe to invalidate when admin saves branding — we can wire that later if needed).

### 3. Brand the Auth page splash too

In `src/pages/Auth.tsx`:

- While `tenantLoading || brandingLoading` and `isTenantPortal` is true, render a branded splash matching the customer layout (same logo + spinner on a neutral background) instead of the unbranded card.
- Use the cached branding from layer 2 so this almost always paints branded instantly.

### Out of scope

- No changes to sidebar/header components themselves.
- No changes to the colour pipeline (`hexToHslString`, CSS vars) — only when the layout starts rendering.
- No changes to anonymous-session bootstrap or auth gating.

## Files touched

- `src/components/CustomerLayout.tsx` — splash gate uses `tenantLoading` too.
- `src/hooks/useTenantFromSlug.ts` — localStorage hydration + write-through cache.
- `src/hooks/useTenantBranding.ts` — `initialData` from localStorage + write-through cache.
- `src/pages/Auth.tsx` — branded splash while tenant/branding load on tenant portals.

## Verification

- Hard-reload `/t/postnet/print-centre` with network throttled to "Slow 3G" — should show either nothing or PostNet logo+spinner immediately, then paint straight into the red sidebar with PostNet logo. No dark sidebar, no "My Print Centre" heading flash.
- Hard-reload `/t/postnet/auth` — should show PostNet logo on the auth card on first paint, never the generic Printer icon.
- Second visit (cache warm) — branded paint on the very first frame, no spinner visible.
- Non-tenant routes (`/auth`, `/`) — unchanged.
