

## Where things stand

### PostNet tenant admin login — partially wired, won't work end-to-end today

**Already in place:**
- `/t/postnet/auth` route renders the branded sign-in page
- DB has `hello@jaimar.dev` with an active `admin` membership for PostNet
- `Auth.tsx` does verify the user has a membership for the slug they signed in at

**Why a real tenant admin can't actually use the system today:**
1. `Auth.tsx` sends every signed-in tenant user from `/t/:slug/auth` to `/t/:slug/dashboard` (the customer storefront). A tenant `owner`/`admin` lands on the customer dashboard with no admin tools.
2. `/admin/*` routes are gated by **legacy `user_roles`** (`head_office_admin`, `platform_admin`). The new `tenant_memberships.role = 'admin' | 'owner'` is not accepted there, so even if the user types `/admin` manually, `ProtectedRoute` bounces them to `/dashboard`.
3. `getDefaultRoute()` only knows the legacy roles. A tenant admin with no `user_roles` row is routed to `/dashboard`.

Net effect: `hello@jaimar.dev` can sign in but lands on the customer dashboard with no PostNet admin console.

### Branch portal — partially wired

**Exists:** routes `/branch`, `/branch/orders`, `/branch/products`, `/branch/settings`; `BranchLayout`, `BranchSidebar`, `BranchDashboard` (counts), `BranchOrders` (read-only), `BranchProducts` (capability toggles), `BranchSettings` (hours, fulfilment, contact). `ProtectedRoute` already accepts `allowedMembershipRoles`.

**Missing for "branches log in, update pricing, work orders":**
- No `branch_manager` / `store_operator` membership exists in DB → nobody can log in to `/branch`
- `BranchOrders` is read-only — no detail page, no status changes, no proof actions, no messaging
- No branch-level pricing UI — pricing is only tenant-wide via `/admin/pricing`
- Sign-in routing has no path that lands a branch user on `/branch`

## Plan

### 1. Tenant admin sign-in routing
After roles + memberships load in `Auth.tsx`, decide by `tenant_memberships.role` for the slug:
- `owner`/`admin` → `/admin?tenant=<id>`
- `sales`/`production`/`accounts` → `/admin?tenant=<id>` (operations)
- `branch_manager`/`store_operator` → `/branch`
- `customer` → `/t/:slug/dashboard`

Mirror in `AuthCallback.tsx` and `AppEntryRedirect.tsx`. Extend `getDefaultRoute()` to accept the active membership role.

### 2. Authorise admin routes by membership
Add `allowedMembershipRoles={["owner","admin"]}` to every `/admin/*` `ProtectedRoute` (operations routes also accept `sales`/`production`/`accounts`). No more reliance on legacy `user_roles` for tenant admins.

### 3. Real branch portal
- **Branch order detail** at `/branch/orders/:id` — reuse `AdminOrderDetail` panels scoped to the user's `branch_id` (status, proof, timeline, internal notes, customer messages)
- **Branch pricing** at `/branch/pricing` — read-only inherited tenant pricing + per-branch overrides (small migration: `pricing_rules.branch_id uuid` + RLS so a branch manager edits only their own)
- **Invite branch staff** action on `/admin/branches/:id` wired to existing `invite-member` edge function with a `branch_id` parameter
- `BranchSidebar`: add Pricing entry

### 4. Polish
- Hide "Back to Platform" cross-link in `AppSidebar` for non-platform tenant admins
- Better empty states when membership shape doesn't match the page

## Verification

1. Sign out → `/t/postnet/auth` → sign in as `hello@jaimar.dev` → lands on `/admin?tenant=postnet` with PostNet branding and admin sidebar.
2. From `/admin/branches/<aliwal>`, invite a branch manager. Accept invite → sign in → lands on `/branch`.
3. Open `/branch/orders/:id`, change status, add internal note → persists; visible in `/admin/orders/:id`.
4. Add a per-branch price override → reflected when a customer chooses that branch.
5. James (`james@jaimar.dev`) at `/auth` still lands on `/platform`. Tenant override into PostNet still works.

## Files

- `src/pages/Auth.tsx`, `src/pages/AuthCallback.tsx`, `src/components/AppEntryRedirect.tsx`, `src/hooks/useAuth.tsx`
- `src/App.tsx` (membership-role guards; new branch routes)
- `src/components/AppSidebar.tsx`, `src/components/BranchSidebar.tsx`
- New: `src/pages/branch/BranchOrderDetail.tsx`, `src/pages/branch/BranchPricing.tsx`
- New migration: `pricing_rules.branch_id` + RLS
- `src/pages/admin/AdminBranchDetail.tsx` — invite branch staff action

## Open questions before I build

**1. Branch pricing scope**
- (a) Inherit only — `/branch/pricing` is read-only, no migration
- (b) Per-branch overrides on top of tenant pricing (recommended)
- (c) Per-branch full pricing tables, independent

**2. First branch user**
- (a) Invite-only via `/admin/branches/:id`
- (b) Seed one demo `branch_manager` for a PostNet branch with a known password so you can test today
- (c) Both

**3. Branch order actions**
- (a) View + status updates only
- (b) View + status + messaging (recommended)
- (c) Full operational control (incl. payments, proofs, reassignment)

**4. Tenant owner/admin landing after `/t/:slug/auth`**
- (a) Tenant admin console (`/admin?tenant=…`) — recommended
- (b) Customer-style dashboard
- (c) Let them choose on first login and remember
