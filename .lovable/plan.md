# Fix 404 on branch-scoped /auth for custom-domain tenants

## Problem

`https://www.postnetprintcentre.com/sandton-city/auth` returns the SPA's 404 page.

The host resolves correctly (PostNet tenant via `custom_domain`), so `useSubdomainTenant().matched` is true and the root-mounted customer routes are active. But the only `/auth` routes registered in `src/App.tsx` are:

- `/auth`
- `/t/:slug/auth`
- `/t/:slug/:branchSlug/auth`

There is **no** `/:branchSlug/auth` variant for tenants served at root (subdomain or custom domain). So `/sandton-city/auth` matches nothing and falls through to `NotFound`.

The path-based equivalent `https://document-centre.com/t/postnet/sandton-city/auth` works because of line 156.

## Fix

In `src/App.tsx`, inside the `{matched && (...)}` block (around lines 181–188), add branch-scoped auth routes alongside the existing global ones:

```tsx
{matched && (
  <>
    <Route path="/:branchSlug/auth" element={<Auth />} />
    <Route path="/:branchSlug/auth/callback" element={<AuthCallback />} />
    <Route path="/" element={<CustomerLayout />}>
      {customerRoutes()}
      <Route path=":branchSlug" element={<BranchSlugRoute />}>
        {customerRoutes()}
      </Route>
    </Route>
  </>
)}
```

These must be registered as siblings (not children of `CustomerLayout`) so `Auth` renders standalone, matching the behaviour of the existing `/t/:slug/:branchSlug/auth` route.

## Verification

- `https://www.postnetprintcentre.com/sandton-city/auth` → Auth page renders (no 404).
- `https://www.postnetprintcentre.com/auth` → still works (global `/auth`).
- `https://document-centre.com/t/postnet/sandton-city/auth` → unchanged.
- Customer storefront paths under `/sandton-city/...` continue to work via the existing `BranchSlugRoute` wrapper.

## Out of scope

- DNS / Amplify www redirects.
- Branch slug validation (handled inside `BranchSlugRoute` / `BranchContext`).
- Any change to `Auth.tsx` itself.
