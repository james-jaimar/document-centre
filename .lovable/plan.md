

## Plan: Branch List View, Users & Roles Fix, and Role-Based Portal Separation

### 1. Branch Management — Dual View (Card + List)

Add a toggle switch (Grid/List icons) to `AdminBranches.tsx`. The card view already exists. The list view will be a `Table` with columns: Name, Code, City, Province, Phone, Email, Status, Actions. Store the view preference in local state (or localStorage). Both views share the same data and action buttons.

**Files**: `src/pages/admin/AdminBranches.tsx`

---

### 2. Users & Roles — Fix 400 Errors

**Root cause**: The `tenant_memberships` table has **no foreign key** to `profiles`. The Supabase PostgREST embedded select `profiles:profile_id(...)` requires a FK to resolve the join, so it returns 400.

**Fix**:
- **Migration**: Add a foreign key from `tenant_memberships.profile_id` → `profiles.id`
- This will allow the embedded select to work correctly
- PostNet currently has 0 memberships, so the "No team members found" is also expected — but the 400 errors are the real bug

**Files**: New migration, no code changes needed in `useTenantMembers.ts`

---

### 3. Three-Tier Portal Separation

Currently all admin/branch routes live under `/admin/*` with role guards. The plan is to create distinct experiences:

#### a. Platform Admin (`/platform/*`) — Already done
You (platform_admin) can see all tenants, override into any tenant's admin view.

#### b. Tenant Admin (`/admin/*`) — Needs refinement
- Accessible to `head_office_admin` role (tenant owners/admins via `tenant_memberships` with role `owner` or `admin`)
- These users see: Dashboard, Orders, Branches, Products, Pricing, Users, Settings
- They do NOT see platform-level pages
- **Change**: When a tenant admin logs in, route them to `/admin` automatically based on their `tenant_memberships` role (not `user_roles`)

#### c. Branch Portal (`/branch/*`) — New dedicated routes
- Accessible to `branch_manager` and `store_operator` roles
- New routes under `/branch/*` with a branch-focused sidebar:
  - `/branch/dashboard` — their branch's orders and stats
  - `/branch/orders` — orders for their branch only
  - `/branch/products` — product capability toggles (already built)
  - `/branch/settings` — branch-level settings (already built)
- New `BranchLayout` or reuse `AppLayout` with branch-specific sidebar sections
- Data is filtered by `branchId` from `TenantContext`

**Key changes**:
- Move existing `/admin/branch/*` routes to `/branch/*`
- Create a branch-aware sidebar that only shows branch-relevant items
- Update `getDefaultRoute()` to route `branch_manager`/`store_operator` to `/branch/dashboard`
- Update `ProtectedRoute` or add a `BranchGuard` that ensures the user has a `branch_id` in their membership
- Branch orders page filters by `branch_id`

**Files**:
- `src/App.tsx` — new `/branch/*` routes
- `src/components/AppSidebar.tsx` — branch portal sidebar variant
- `src/pages/branch/BranchDashboard.tsx` — branch-specific dashboard
- `src/pages/branch/BranchOrders.tsx` — new, filtered by branch
- Migration: FK on `tenant_memberships.profile_id`

### Summary of Changes

| Step | Type | Description |
|------|------|-------------|
| Migration | DB | Add FK `tenant_memberships.profile_id → profiles.id` |
| AdminBranches | UI | Add list/grid view toggle |
| Branch Portal | Routing + UI | Dedicated `/branch/*` routes with branch-scoped sidebar and data |
| Auth routing | Logic | Route branch staff to `/branch/dashboard` on login |

