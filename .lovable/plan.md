## Problem

On refresh of a tenant branch URL (e.g. `/t/demo/<branch>/...`), the "This store isn't online yet" page flashes briefly before the real content renders.

## Root cause

`BranchSlugRoute` decides whether to show `StoreNotAvailable` based on `useBranch().loading` and `findBranchBySlug(branchSlug)`. The branch context is supplied by `BranchProvider` in `CustomerLayout`, which receives `tenantId` from `useTenantFromSlug()`.

In `BranchProvider`:

```ts
if (!tenantId) {
  setAllBranches([]);
  setActiveBranch(null);
  setLoading(false);   // <-- loading flips false BEFORE branches can be fetched
  return;
}
```

Sequence on refresh:
1. `useTenantFromSlug` is still resolving → `tenantId = null`.
2. `BranchProvider` immediately sets `loading=false` with `allBranches=[]`.
3. `BranchSlugRoute` sees `!loading` and `!branch` → renders `StoreNotAvailable`.
4. A tick later `tenantId` resolves, branches load, the real page mounts. → visible flash.

This affects every tenant on slow connections; the user noticed it on the demo tenant.

## Fix

Treat "tenant not yet known" as still-loading inside `BranchProvider`, so `BranchSlugRoute` keeps rendering its `<Outlet />` (which itself is gated by tenant/branding loaders) instead of the not-available page.

### Change

`src/contexts/BranchContext.tsx` — in the initial `useEffect` that loads branches:

- When `tenantId` is `null`, keep `loading: true` (do not flip it to false). Reset `allBranches`/`activeBranch` as today, but stay in the loading state until a real `tenantId` arrives.

```ts
if (!tenantId) {
  setAllBranches([]);
  setActiveBranch(null);
  setLoading(true);  // was: false
  return;
}
```

Optional belt-and-braces in `BranchSlugRoute.tsx`: also short-circuit when `allBranches.length === 0` AND `loading` was just true (already covered by the fix above, so not strictly required).

## Technical notes

- `useBranch()` already exposes `loading`; no API change.
- The default no-provider fallback in `useBranch` keeps `loading: false` — that is correct because it is only used outside tenant routes.
- No DB / RLS changes. UI-only fix.

## Verification

1. Hard refresh `/t/demo/<branch>/...` on a throttled connection — no "store not online" flash.
2. Navigate to `/t/demo/bogus-branch` — `StoreNotAvailable` still appears once branches finish loading.
3. Single-branch tenant still auto-selects; multi-branch picker still appears when no slug is in the URL.
