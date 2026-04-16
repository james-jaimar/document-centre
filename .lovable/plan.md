

# Infrastructure Audit & Remediation Plan

## Current State Summary

After a thorough audit, here is every broken, missing, or incomplete piece across the three tiers.

---

## Tier 1: Data & Auth Foundation

### 1A. PostNet has ZERO members
PostNet tenant (`c0000000-...0002`) has 60 branches and 0 members. Nobody can access it as a tenant admin. Your platform_admin account (james@...) has an owner membership only in PrintWorx.

**Fix:** Create an `invite-member` Edge Function that uses the Admin API to:
- Invite a user by email (or find existing profile)
- Create the `tenant_memberships` row
- Update `AddMemberDialog` to show an "Invite" button when profile not found

### 1B. Cart has no tenant scoping
`useCart()` queries by `user_id` only -- no `tenant_id`. A user with memberships in two tenants gets ONE shared cart across both. Cart items from PostNet bleed into PrintWorx.

**Fix:** Pass `tenantId` into `useCart`, `getOrCreateCartId`, `useAddItemToCart`, `useEditCartItem`. Filter cart queries by `tenant_id`.

### 1C. Checkout doesn't create order_jobs
`usePlaceOrder` just flips `order_status` from `cart` to `confirmed`. It never calls the `order-engine` to create `order_jobs`, generate an `order_number`, or create pricing snapshots. The order lands in the admin Order Manager with no jobs, no number, no pricing.

**Fix:** `usePlaceOrder` must call the `order-engine` Edge Function's `createOrderWithJobs` action to properly transition from cart to submitted order with jobs, numbers, and pricing.

### 1D. `timeline_events` table doesn't exist
`fetchOrderDetail` queries `timeline_events` which returns a 400/404 error silently. The schema has `status_history` and `messages` but no `timeline_events`.

**Fix:** Replace `timeline_events` reference with `status_history` in `fetchOrderDetail`.

---

## Tier 2: Customer Portal (Ecommerce)

### 2A. Customer Settings is a stub
`CustomerSettings.tsx` is 8 lines -- just a heading. No profile editing, no password change, no address book.

**Fix:** Build out with: profile editing (name, email, phone), password change via `supabase.auth.updateUser`, and saved delivery addresses from `order_addresses`.

### 2B. Customer Dashboard queries not tenant-scoped
`useRecentDocuments`, `useRecentOrderItems`, `useTrackingOrders` all query by `user_id` only. Multi-tenant users see cross-tenant data.

**Fix:** Add `tenantId` filtering to all three hooks (filter via order's `tenant_id` using inner joins).

### 2C. Order number display
Orders show truncated UUIDs (`58d7a4bb`) instead of proper order numbers because `order_number` is null -- the checkout flow never generates one (see 1C above).

### 2D. No order re-order/re-print functionality
"Frequently Ordered" section just shows recent documents with a "Reorder" button that navigates to the order builder. True reorder (clone previous config) is missing.

---

## Tier 3: Admin / Tenant Portal

### 3A. Admin Dashboard is static placeholder
Shows "—" for all four cards. No live data.

**Fix:** Query actual counts (branches, products, users, orders) from DB scoped to `tenantId`.

### 3B. Admin Users: Add Member can't invite
When searching for an email that doesn't exist, it shows "user needs to sign up first" with no way forward. Staff can't onboard new team members or customers.

**Fix:** `invite-member` Edge Function (same as 1A).

### 3C. Admin Order Detail: no status actions
The admin order detail page displays data but has no buttons to change job status, record payments, or manage proofs. It's read-only.

**Fix:** Add action buttons to `JobDetailPanel` that call `updateJobStatus`, `recordPaymentEvent`, and `createJobProof` mutations.

### 3D. Branch portal orders not scoped
`BranchOrders` likely has the same tenant/branch scoping issues.

---

## Tier 4: Platform Admin

### 4A. Platform Settings is likely a stub
### 4B. Can't create new tenants from the UI
`PlatformTenants` shows existing tenants but has no "Create Tenant" button. Onboarding new tenants requires direct DB access.

---

## Prioritised Implementation Plan

Given the volume, I recommend three phases, with Phase 1 being critical to unblock all testing.

### Phase 1: Foundation (must-fix before anything else works)

| # | Task | Files |
|---|------|-------|
| 1 | **Create `invite-member` Edge Function** | `supabase/functions/invite-member/index.ts` |
| 2 | **Update AddMemberDialog with invite flow** | `src/components/admin/AddMemberDialog.tsx` |
| 3 | **Tenant-scope the cart** | `src/hooks/useCart.ts` |
| 4 | **Fix checkout to use order-engine** | `src/hooks/useCart.ts` (`usePlaceOrder`) |
| 5 | **Fix `timeline_events` → `status_history`** | `src/lib/orders/queries.ts` |
| 6 | **Tenant-scope dashboard queries** | `src/pages/dashboard/CustomerDashboard.tsx` |

### Phase 2: Customer Ecommerce Experience

| # | Task | Files |
|---|------|-------|
| 7 | **Build Customer Settings page** | `src/pages/dashboard/CustomerSettings.tsx` |
| 8 | **Admin Dashboard live data** | `src/pages/admin/AdminDashboard.tsx` |
| 9 | **Admin job status actions** | `src/components/orders/detail/JobDetailPanel.tsx` |
| 10 | **Admin record payment action** | `src/components/orders/detail/OrderPricingTab.tsx` |

### Phase 3: Platform Management

| # | Task | Files |
|---|------|-------|
| 11 | **Create Tenant button + dialog** | `src/pages/platform/PlatformTenants.tsx` |
| 12 | **Platform Settings page** | `src/pages/platform/PlatformSettings.tsx` |
| 13 | **Branch portal scoping audit** | `src/pages/branch/*` |

---

## Technical Details

**invite-member Edge Function:**
```
POST /invite-member
Body: { email, tenant_id, app_id, role, branch_id?, can_view_all_orders? }
Auth: caller must be staff for the tenant (verified via getUser + membership check)
Uses: supabase.auth.admin.inviteUserByEmail() + profiles upsert + tenant_memberships insert
```

**Cart tenant scoping:**
- `useCart` accepts `tenantId` param, adds `.eq("tenant_id", tenantId)` to cart query
- `getOrCreateCartId` includes `tenant_id` in both the lookup and the insert
- One cart per tenant per user

**Checkout → order-engine:**
- Instead of a direct `.update()` on orders, `usePlaceOrder` calls `createOrderWithJobs` which:
  - Generates `order_number` via `generate_order_number()`
  - Creates `order_jobs` from `order_items` + their configurations
  - Creates `order_pricing_snapshots`
  - Sets proper `admin_status`, `customer_status`, `payment_status`
  - Records `status_history` entries

**timeline_events → status_history:**
- Simple rename in `fetchOrderDetail`: change `timeline_events` to `status_history`
- Update `TimelinePanel` to handle `status_history` column names (`from_status`, `to_status`, `entity_type`, `reason`)

---

I recommend approving Phase 1 first (items 1-6) as they unblock everything else. Phases 2 and 3 can follow iteratively.

