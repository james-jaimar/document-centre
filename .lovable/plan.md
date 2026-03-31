

# Plan: Wire Up Multi-Tenant Foundation

## Problem

The current app has two parallel systems that aren't connected:

1. **Legacy system** — `useAuth` fetches roles from `user_roles` table (global roles like `platform_admin`, `head_office_admin`). Products/pricing use `tenant_id` from `profiles.tenant_id` via `get_user_tenant_id()`. No awareness of `apps` or `tenant_memberships`.

2. **New order engine** — Uses `apps`, `tenant_memberships`, `tenant_id`/`app_id` on orders. RLS uses `user_is_staff_for()` and `user_can_read_order()` which check `tenant_memberships`.

Products, pricing, branches, and the customer order builder all use the legacy `profiles.tenant_id` + `user_roles` pattern. The new order engine uses `tenant_memberships`. These two systems don't talk to each other — meaning admin screens for products/pricing won't filter by the right tenant, and the order engine can't find the user's membership context.

## What Needs to Happen

### 1. Create a Tenant Context Provider

A new `useTenantContext` hook that loads the current user's tenant membership(s) on login and exposes:
- `appId`, `tenantId`, `branchId`, `membershipRole`
- Falls back gracefully if user only has legacy `user_roles` (during transition)

This replaces scattered `get_user_tenant_id()` calls on the client side with a single source of truth.

### 2. Wire Auth to Load Memberships

Update `useAuth.tsx` to also fetch the user's `tenant_memberships` alongside `user_roles`. Expose both so existing role checks still work while new membership checks are available.

### 3. Tenant-Scope All Admin Queries

Update these hooks to filter by `tenant_id` from context:
- `useProductFamilies` — add `.eq("tenant_id", tenantId)` (or `.is("tenant_id", null)` for global)
- `usePricingRules` — same pattern
- `useAdminOrders` — pass `tenant_id` and `app_id` from context
- `seedBoundDocument` — accept `tenant_id` parameter

### 4. Build Tenant & Branch Admin Pages

**Tenant Management** (`/platform` — platform_admin only):
- List all tenants, create/edit tenant with name, slug, logo, settings
- Assign apps to tenants

**Branch Management** (`/admin/branches` — head_office_admin+):
- List branches for current tenant
- Create/edit branch with name, address, code, contact info
- Toggle active status

### 5. Build Users & Roles Page

**Users & Roles** (`/admin/users` — head_office_admin+):
- List all `tenant_memberships` for current tenant (joined with profiles)
- Invite user / assign membership role (owner, admin, sales, production, accounts, customer)
- Assign to branch
- Toggle `can_view_all_orders`

### 6. Ensure Seed Data Consistency

The existing seed migration created an app, tenant, branch, and membership for the current user. Verify this is correctly wired so the admin pages show data.

## Technical Details

### New files
- `src/hooks/useTenantContext.tsx` — React context providing `appId`, `tenantId`, `branchId`, `role` from `tenant_memberships`
- `src/hooks/useTenants.ts` — CRUD hooks for tenants table
- `src/hooks/useBranches.ts` — CRUD hooks for branches table
- `src/hooks/useTenantMembers.ts` — hooks for listing/managing memberships
- `src/pages/platform/PlatformTenants.tsx` — rewrite with full CRUD
- `src/pages/admin/AdminBranches.tsx` — rewrite with full CRUD
- `src/pages/admin/AdminUsers.tsx` — rewrite with membership management

### Modified files
- `src/hooks/useAuth.tsx` — fetch `tenant_memberships` alongside `user_roles`, expose in context
- `src/hooks/useProductFamilies.ts` — accept/use `tenantId` filter
- `src/hooks/usePricingRules.ts` — accept/use `tenantId` filter
- `src/hooks/useOrders.ts` — pass tenant context to queries
- `src/lib/orders/queries.ts` — use `app_id`/`tenant_id` filters
- `src/lib/seedBoundDocument.ts` — accept `tenantId` parameter
- `src/App.tsx` — wrap routes with `TenantProvider`
- `src/components/AppSidebar.tsx` — show current tenant name in header

### Database migrations needed
- Add RLS INSERT policies for `tenant_memberships` (staff can invite)
- Add RLS INSERT/UPDATE/DELETE policies for `tenants` (currently only platform_admin can manage)
- Possibly add INSERT policies for `branches` (head_office_admin)

### Implementation order
1. Database: add missing RLS policies for CRUD on tenants, branches, memberships
2. `useTenantContext` provider + wire into `useAuth`
3. Tenant-scope existing hooks (products, pricing, orders)
4. Build Tenant Management page (platform level)
5. Build Branch Management page (admin level)
6. Build Users & Roles page (admin level)
7. Update sidebar to show tenant context

