

# Plan: Enforce Tenant Isolation in Order Manager

## Problem
The `AdminOrders` page builds query filters but never includes `tenant_id`. Since you're logged in as a platform admin, RLS allows access to all orders across all tenants — so PostNet sees PrintWorx orders and vice versa.

## Root Cause
Line 39-44 of `AdminOrders.tsx` — `tenantId` from `useTenantContext()` is available but never added to the filters object.

## Fix

| File | Change |
|------|--------|
| `src/pages/admin/AdminOrders.tsx` | Add `tenant_id: tenantId` to the filters object (line ~43) |

That's it — one line. The query function already supports `filters.tenant_id` (line 36 of `queries.ts`: `if (filters.tenant_id) query = query.eq("tenant_id", filters.tenant_id)`). It's just never being passed.

### The line change:
```typescript
const filters: AdminOrderListFilters = {
  tenant_id: tenantId || undefined,  // ← ADD THIS
  search: search || undefined,
  admin_status: selectedStatuses.length ? selectedStatuses : undefined,
  page,
  page_size: 25,
};
```

## Also check: Customer orders
The `fetchCustomerOrders` query similarly lacks tenant filtering — but that's currently protected by the `user_can_read_order` RLS function which checks membership. Still, for defence-in-depth, we should pass the tenant context there too if available.

## Also check: Order detail
`fetchOrderDetail` fetches by order ID with no tenant guard. RLS protects this, but the admin detail page should verify the returned order's `tenant_id` matches the current context to prevent accidental cross-tenant navigation.

