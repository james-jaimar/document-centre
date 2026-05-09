# Branch-scoped tenant URLs

Goal: let each PostNet branch share a clean, direct URL like `postnet.documentcentre.com/sandtoncity` (or `/t/postnet/sandtoncity` on path-based routing) that locks the customer into that branch's storefront for every action. Non-pilot branches stay dormant. Customers landing without a branch keep the existing picker.

## What changes for the user

1. **Direct branch URLs** — every customer route gains a branch slug segment:
   - On subdomain: `postnet.documentcentre.com/sandtoncity`, `/sandtoncity/orders/new`, `/sandtoncity/cart`, `/sandtoncity/checkout`, etc.
   - On path-based: `/t/postnet/sandtoncity`, `/t/postnet/sandtoncity/orders/new`, etc.
   - Visiting one of these auto-selects the branch — no picker, no clicks.
2. **Bare tenant URL** (`postnet.documentcentre.com/`) keeps today's behaviour: shows the branch picker modal, but filtered to **live** pilot branches only.
3. **Non-pilot branches** (the 500+ stores not yet in the pilot) — their URLs return a friendly "This store isn't online yet" page, and they don't appear in the picker.
4. **Branch-aware sharing** — staff can copy a "Share my branch URL" link from the branch settings/dashboard.

## What changes under the hood

### Database
- Add `branches.is_live` (boolean, default `false`). Separate from `is_active`: active = exists in our records, live = accepts orders through the portal.
- Backfill: keep the original ~52 PostNet branches as-is; mark a curated pilot set as `is_live=true` (admin will pick which ones — initially do all currently-active non-imported branches, then admin curates).
- Add `branches.url_slug` — optional override on top of the existing `slug`. Lets us shorten `postnet-sandton-city-shopping-centre` → `sandtoncity` without changing the canonical slug used elsewhere. Falls back to `slug` when null. Unique per tenant.

### Routing (`src/App.tsx`)
- Inject a `:branchSlug` segment into the customer routes:
  - Path-based: `/t/:slug/:branchSlug/*`
  - Subdomain: `/:branchSlug/*`
- `/t/:slug` (no branch) and `/` on subdomain (no branch) keep rendering `CustomerLayout` and fire the picker.
- Auth/legal routes (`/auth`, `/terms`, `/privacy`) stay branch-agnostic.

### Branch resolution (`BranchContext`)
- New priority order:
  1. **URL `:branchSlug`** (source of truth — overrides everything)
  2. localStorage (only when no slug in URL)
  3. Picker (multi-branch, no saved choice)
- When the URL slug doesn't match any live branch for this tenant → show "Store not available" page with link back to picker.
- localStorage still updates so a user who later visits the bare URL lands back on their last branch.
- `useTenantSlug` gains a `branchPath(path)` helper alongside `tenantPath(path)` so links are constructed correctly everywhere.

### Internal links
- Update all customer-portal `Link`/`navigate` calls to include the branch slug. Centralised through `tenantPath` already; we extend it to inject the active branch slug automatically when one is set.

### Admin / Branch portal additions
- **Branches table (`/admin/branches`)**: new "Live" toggle column + "URL slug" field + "Copy public URL" button.
- **Branch detail**: shows the full public URL with copy button and a QR code (already have QR infra from mobile upload).
- **Branch picker modal**: filters to `is_live=true` only.

### Pilot slug curation
- One-time admin task (manual, via the branches table edit UI): for each pilot branch, set a friendly `url_slug` (e.g. `sandtoncity`, `rosebank`, `claremont`). Validation: lowercase, alphanumeric + hyphens, unique per tenant.

## Out of scope (deliberately)
- No automatic redirects from `/` to a default branch.
- No marketing landing/search page (keeping current picker).
- No changes to admin/branch/platform portals' routing — only customer routes get the branch segment.
- No SEO/sitemap work for branch URLs (can come later once pilot validates the model).

## Rollout order
1. Migration: add `is_live`, `url_slug`, default the pilot set.
2. Routing changes + `BranchContext` URL-first resolution.
3. Picker filter + "store not available" page.
4. Admin UI: Live toggle, URL slug field, Copy URL / QR.
5. Curate pilot slugs in admin.
6. Hand the URLs to the pilot stores.

## Technical notes (for implementation)
- The new route pattern means existing deep links without a branch segment must still work — fall back to picker if the first path segment isn't a known branch slug (use a route-level resolver).
- Branch slug collisions with existing top-level customer routes (`orders`, `cart`, `checkout`, `account`, `auth`, `dashboard`, `print-centre`) must be rejected at slug-validation time (reserved-words list).
- `clearSavedBranch` on sign-out stays as-is.
- RLS: `branches_public_read` already filters on `is_active=true`; we'll tighten the picker query to also require `is_live=true`. The "store not available" page reads via the same public policy and shows a generic message regardless of why it failed.
