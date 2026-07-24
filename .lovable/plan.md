## Problem

Brand Strip is configured and saved correctly, but not rendering on the tenant portal. Root cause: `useTenantBranding.ts` uses react-query `initialData` from `localStorage` without `initialDataUpdatedAt`, combined with `staleTime: 5min`. React Query treats that as fresh data and skips the background refetch. The cached snapshot was written before `brand_strip_*` fields existed, so those fields are missing → `BrandStrip` sees `brand_strip_enabled=false` → returns null.

## Fix

Edit `src/hooks/useTenantBranding.ts`:

1. Bump the cache version key (e.g. `tenant_branding:v2:`) so all previously cached branding blobs are ignored — guarantees a one-time refetch for every existing visitor, not just those past staleTime.
2. Pass `initialDataUpdatedAt: 0` alongside `initialData` so react-query considers the hydrated cache stale and issues a background refetch on mount. This preserves the no-flash first paint while ensuring fresh data lands immediately.

No other files change. `BrandStrip.tsx`, `CustomerLayout.tsx`, and `BrandingTab.tsx` are already correct.

## Verification

After the change, the 3@1 tenant portal should show the blue brand strip band above the header on next load. Confirm by reloading `/t/3at1/appletons/print-centre`.
