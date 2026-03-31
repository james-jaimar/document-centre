

# Plan: Restructure Navigation for Multi-Tenant SaaS

## Problem

The current sidebar mixes concerns across portals:
- **Customer section** (Dashboard, My Orders, Account) appears in the admin sidebar — it shouldn't. Customers have their own `CustomerLayout` with `CustomerSidebar`.
- **Branch** is a top-level section, but branches belong under a tenant. Branch queue/settings should be nested under admin.
- **Administration** and **Platform** are peers, but the hierarchy should be: Platform → Tenants → (Branches, Users, Products, etc.)
- Clicking a tenant on the Platform page should navigate into that tenant's admin, not just show an edit dialog.

## Target Navigation Structure

```text
PLATFORM ADMIN SIDEBAR (when on /platform/*)
─────────────────────────────
Platform
  ├── Tenants              /platform/tenants
  └── Platform Settings    /platform/settings

TENANT ADMIN SIDEBAR (when on /admin/*)
─────────────────────────────
Operations
  ├── Dashboard            /admin
  ├── Order Manager        /admin/orders
  └── Production Queue     /admin/production

Configuration
  ├── Branches             /admin/branches
  ├── Products             /admin/products
  ├── Pricing              /admin/pricing
  └── Users & Roles        /admin/users

Settings
  └── Tenant Settings      /admin/settings

CUSTOMER SIDEBAR (unchanged — /dashboard/*)
─────────────────────────────
  ├── Home
  ├── Create
  ├── Orders
  └── Account Settings
```

## Key Changes

### 1. Remove Customer section from admin sidebar
The admin `AppSidebar` currently shows Customer nav items (Dashboard, My Orders, Account). Remove them entirely. Customer portal is a separate layout and sidebar.

### 2. Merge Branch into Admin
Branch Queue and Branch Settings move under the admin sidebar as operational items. Routes stay at `/admin/production` (renamed from `/branch`) and branch settings become part of tenant config. Remove the standalone "Branch" section.

### 3. Restructure admin sidebar into logical groups
Three groups: **Operations** (day-to-day work), **Configuration** (setup), **Settings** (tenant config). No "Branch" or "Customer" headings.

### 4. Platform tenant click-through
On the Platform Tenants page, clicking a tenant navigates to `/admin?tenant=<id>` (or a future `/platform/tenants/:id` detail page) instead of opening an inline edit dialog. For now, keep the edit dialog but add a "Manage" button that links to `/admin`.

### 5. Update routing
- Rename `/branch` → `/admin/production` (branch production queue)
- Keep `/branch/settings` as `/admin/branches/:id` (future) or fold into existing `/admin/branches`
- Update `ProtectedRoute` role checks accordingly

### 6. Role-based sidebar visibility
- `platform_admin` sees: Platform sidebar when on `/platform/*`, Tenant admin sidebar when on `/admin/*`
- `head_office_admin` / `owner` / `admin` sees: Tenant admin sidebar only
- `sales` / `production` / `accounts` sees: subset of Operations items
- `customer` sees: Customer sidebar only (already separate)

## Files to modify

- **`src/components/AppSidebar.tsx`** — Remove Customer section, merge Branch into Admin, restructure into Operations/Configuration/Settings groups
- **`src/App.tsx`** — Update route paths (rename `/branch` → `/admin/production`), consolidate role guards
- **`src/pages/platform/PlatformTenants.tsx`** — Add "Manage" link per tenant card
- **`src/components/ProtectedRoute.tsx`** — Support tenant membership roles alongside legacy `app_role` enum (allow `owner`, `admin`, `sales`, `production`, `accounts` as valid role checks)

## Files unchanged
- `src/components/CustomerSidebar.tsx` — Already correct and separate
- `src/components/CustomerLayout.tsx` — Already correct
- All `/dashboard/*` pages — Untouched

## Implementation order
1. Update `AppSidebar.tsx` — new nav structure
2. Update `App.tsx` — route consolidation
3. Update `ProtectedRoute.tsx` — support membership roles
4. Update `PlatformTenants.tsx` — add tenant manage link

