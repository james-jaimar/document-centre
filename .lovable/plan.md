

# Plan: Users & Roles Fix + Customer Order Detail Page

## Problem Summary

Two issues:

1. **Admin Users page** — works per-tenant already via `useTenantMembers(tenantId, appId)`. The page itself should function correctly when `tenantId` is set via the `?tenant=` override. Need to verify console errors and fix any issues.

2. **Customer area** — missing a proper order detail/tracking page. Currently, clicking a submitted order navigates to `/build` (the configurator). Also, `CustomerOrders` queries orders by `user_id` only — no `tenant_id` filter, so a user with memberships in multiple tenants sees all their orders regardless of which storefront they're on.

## Changes

### 1. Tenant-scope customer order queries

| File | Change |
|------|--------|
| `src/pages/dashboard/CustomerOrders.tsx` | Add `tenant_id` filter to `useUserOrders` query using `useTenantContext()`. Pass `tenantId` to the hook. |
| `src/pages/dashboard/CustomerDashboard.tsx` | Add `tenant_id` filter to `useTrackingOrders`, `useRecentOrderItems`, and `useRecentDocuments` queries. |

### 2. Customer Order Detail page

| File | Change |
|------|--------|
| `src/pages/dashboard/CustomerOrderDetail.tsx` | **New file.** Ecommerce-style order view showing: order summary (number, status, date, totals), list of jobs with customer-facing statuses, and a messaging/timeline panel using existing `TimelinePanel` component with `sender_type: "customer"`. |
| `src/App.tsx` | Add route `orders/:id` under `/t/:slug` pointing to `CustomerOrderDetail`. |
| `src/pages/dashboard/CustomerOrders.tsx` | Update click handler: non-draft orders navigate to `/t/${slug}/orders/${id}` (detail page) instead of `/build`. |
| `src/pages/dashboard/CustomerDashboard.tsx` | Update Order Tracking click to navigate to `/t/${slug}/orders/${id}` instead of `/build`. |

### 3. Admin Users page console error audit

| File | Change |
|------|--------|
| `src/pages/admin/AdminUsers.tsx` | Verify the page renders correctly with tenant override. The `useTenantMembers` hook already filters by `tenantId` + `appId` from context — this should work. Will check for Select component empty-string value issues (Radix Select doesn't allow `value=""`) and fix if present. |

## Technical Details

**Customer Order Detail page structure:**
- Reuses `OrderSummaryTab`, `OrderPricingTab`, `OrderDeliveryTab`, `TimelinePanel` from `src/components/orders/detail/`
- Uses `useOrderDetail(orderId)` hook
- Shows customer-facing status (not admin status)
- Messaging sends with `sender_type: "customer"`
- Back button returns to `/t/:slug/orders`

**Tenant scoping in customer queries:**
```typescript
// Before:
.eq("user_id", userId)

// After:
.eq("user_id", userId)
.eq("tenant_id", tenantId)
```

**Select empty-string fix (if needed):**
Replace `<SelectItem value="">All branches</SelectItem>` with `<SelectItem value="__all__">All branches</SelectItem>` and map accordingly, since Radix Select throws console errors for empty string values.

