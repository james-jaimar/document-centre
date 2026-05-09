# Branch-Slug Suffix Coverage Audit

I traced every place that builds a tenant URL or redirects within a tenant. The good news: **all routine in-app navigation already preserves the branch segment automatically** because it goes through `tenantPath()` in `useTenantSlug`, which now injects `activeBranch` from `BranchContext`.

The gaps are in a handful of low-level redirects that build `/t/${slug}/...` strings directly and don't know about the branch.

## What's already correct (no action needed)

- All sidebar / header / footer links (`CustomerSidebar`, `CustomerHeader`, `CustomerFooter`)
- All in-page `navigate(tenantPath(...))` calls in `OrderFiles`, `OrderBuild`, `NewOrder`, `Cart`, `Checkout`, `OrderConfirmation`, `CustomerDashboard`, `CustomerOrders`, `CustomerOrderDetail`, `PhotoPrintsBuilder`
- `BranchPicker` (intentionally writes the branch segment when user picks)
- `StoreNotAvailable` "back to picker" link
- `App.tsx` route table — auth + customer routes have both `/t/:slug/...` and `/t/:slug/:branchSlug/...` variants
- Route ranking — static segments (`orders`, `cart`, etc.) win over `:branchSlug` in React Router v6, and the slug-validation trigger blocks reserved words, so collisions are impossible

## Gaps found — files that strip the branch segment

These all build raw `/t/${slug}/...` strings without consulting the active branch URL slug:

1. **`src/components/ProtectedRoute.tsx`** (lines 31–35)
   - `slugMatch` only captures `:slug`, drops `:branchSlug`
   - Unauthenticated user on `/t/postnet/sandtoncity/orders/123` gets bounced to `/t/postnet/auth` (branch lost). After login they land back in the no-branch picker.

2. **`src/pages/AuthCallback.tsx`** (lines 111, 135, 162)
   - The `returnPath` check uses `startsWith('/t/' + tenantSlug)` which DOES match branch-scoped paths, so the happy-path return works.
   - But the fallback redirects (`/t/${targetSlug}/auth`, `/t/${targetSlug}/print-centre` via landingRoute) drop the branch.

3. **`src/lib/auth/landingRoute.ts`** (line 48)
   - `/t/${targetSlug}/print-centre` — strips branch on every "where do I send this user after login" decision.

4. **`src/pages/Auth.tsx`** (line 118)
   - Post-signup redirect to `/t/${targetSlug}/auth?email=...` strips branch.

5. **`src/components/StorefrontRedirect.tsx`** (line 44)
   - Legacy `/dashboard/*` → `/t/${slug}/${targetPath}` rewrite strips branch (acceptable — legacy callers pre-date branches, picker will appear).

6. **`src/pages/storefront/StorefrontLanding.tsx`** (lines 44, 67, 169)
   - Hardcoded `/t/${slug}/auth`. This page is the no-branch tenant landing, so technically OK, but if we ever surface it under a branch URL it would lose context.

## Proposed fix (small, surgical)

Add a helper and thread the branch slug through the affected redirects.

### A. Read branch from URL, not just context

`ProtectedRoute`, `AuthCallback`, `Auth.tsx`, `landingRoute.ts` all run before `BranchContext` may have resolved (or in places where the branch is purely URL-derived). So the cleanest fix is to **parse the branch slug from `location.pathname` at the same time as the tenant slug**.

Add to `src/lib/auth/landingRoute.ts` (or a new `src/lib/tenantUrl.ts`):

```ts
// Extract { slug, branchSlug } from any tenant-style pathname.
export function parseTenantPath(pathname: string): { slug: string | null; branchSlug: string | null } {
  const m = pathname.match(/^\/t\/([^/]+)(?:\/([^/]+))?/);
  if (!m) return { slug: null, branchSlug: null };
  const reserved = new Set(['auth','dashboard','print-centre','orders','cart','checkout','account','settings','terms','privacy','upload']);
  const second = m[2] && !reserved.has(m[2]) ? m[2] : null;
  return { slug: m[1], branchSlug: second };
}

export function buildTenantPath(slug: string, branchSlug: string | null, rest: string) {
  const branch = branchSlug ? `${branchSlug}/` : '';
  return `/t/${slug}/${branch}${rest.replace(/^\//, '')}`;
}
```

(Reserved-word guard mirrors the DB trigger, so `/t/postnet/orders/123` doesn't get parsed as branch="orders".)

### B. Apply it in 4 files

1. **`ProtectedRoute.tsx`** — replace `slugMatch` block with `parseTenantPath(location.pathname)` and use `buildTenantPath(slug, branchSlug, 'auth' | 'dashboard')`. Also save `location.pathname + location.search` as `RETURN_PATH_KEY` so post-login can resume the exact URL.

2. **`AuthCallback.tsx`** — when computing the fallback destination, parse the current URL (and/or stored `returnPath`) for the branch and pass it through `buildTenantPath`.

3. **`Auth.tsx`** (line 118) — parse current pathname for branch; build redirect with `buildTenantPath`.

4. **`landingRoute.ts`** — accept optional `branchSlug` arg and emit `/t/${slug}/${branchSlug}/print-centre` when present. Caller (`AuthCallback`) passes the parsed value.

### C. Subdomain parity

The same bug exists on subdomain hosts in theory, but every redirect we touched is path-based (`/t/...`). On subdomains the URL is just `/branchSlug/...` and `tenantPath()` already injects it. No subdomain changes needed.

### D. StorefrontLanding & StorefrontRedirect

Leave as-is for this pass — these are entry points where no branch has been chosen yet, so dropping to the picker is the correct behaviour.

## Out of scope

- Changing `BranchPicker` (it intentionally writes the branch slug)
- Subdomain-specific routing
- Marketing pages (`/try`, `/contact`, `/pricing`) — tenant-agnostic
- Admin / Platform / Branch-portal routes — all branch-scoped via `branch_id` in the data layer, not the URL

## Risk

Low. All four edited files are small and the helper is pure. Existing no-branch URLs continue to work because `branchSlug` is `null` and `buildTenantPath` collapses to the legacy form.
