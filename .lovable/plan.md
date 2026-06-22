# Fix stale-chunk error on Place Order

## What happened
When you placed the order, the browser tried to load `resolveBranchTax-DvUlD4mF.js`. That file no longer exists because a redeploy went out while your tab was open — Vite renames chunks on every build, and the old `index.html` in your tab pointed at the old hash. The dynamic `import()` 404s, and `useCart.placeOrder` surfaces it as "Failed to place order".

A hard refresh (Cmd/Ctrl+Shift+R) would have let you complete the order, but we should stop this from hitting real customers.

## Fix — two parts

### 1. Remove the dynamic import on the checkout hot path
`src/hooks/useCart.ts` lazy-loads `@/lib/tax/resolveBranchTax` inside `placeOrder`. Tax resolution runs on every checkout and the module is tiny, so code-splitting buys us nothing and exposes us to this exact failure. Convert it to a static top-of-file import so it ships in the main bundle and can't 404 mid-flow.

### 2. Add a global safety net for any other dynamic imports
Add a `vite:preloadError` listener in `src/main.tsx` that, on a chunk-load failure, shows a toast ("A new version is available — reloading…") and calls `location.reload()`. This is the Vite-recommended pattern and protects every other route-level lazy import (admin pages, platform pages, etc.) from the same class of bug on future deploys.

## Out of scope
- No changes to the tax logic itself, the cart flow, or any other dynamic imports.
- No service-worker / cache-busting changes — the reload listener is sufficient.

## Verification
- Trigger a fresh build, place a test order in PostNet Sandton → completes without error.
- Manually simulate by deleting a known chunk file from the dev build and navigating to a lazy route → confirm auto-reload toast fires instead of a silent failure.
