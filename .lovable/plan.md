

# Plan: Wire All Customer Portal Links to Slug-Based URLs

## Problem

The routing structure was updated to `/t/:slug/*` but all internal navigation and links within the customer portal still use hardcoded `/dashboard/...` paths. This means clicking buttons (New Order, Continue, Back, etc.) and sidebar links navigates to the legacy redirect URLs instead of staying within the slug-scoped storefront.

## Affected files and changes

### 1. `src/components/CustomerSidebar.tsx`
The `NAV_ITEMS` array hardcodes `/dashboard`, `/dashboard/orders/new`, etc. These need to become dynamic using the current slug from the URL.

- Read `:slug` from `useParams`
- Change NAV_ITEMS to a function that builds paths like `/t/${slug}/dashboard`, `/t/${slug}/orders`, etc.

### 2. `src/pages/dashboard/CustomerDashboard.tsx`
~10 navigate calls using `/dashboard/orders/...` patterns. All need to use `/t/${slug}/...` instead.

- Add `useParams` to get slug
- Replace all `navigate("/dashboard/...")` with `navigate("/t/${slug}/...")`

### 3. `src/pages/dashboard/CustomerOrders.tsx`
Navigate to `/dashboard/orders/new` — needs slug prefix.

- Add `useParams`, update navigate call

### 4. `src/pages/dashboard/NewOrder.tsx`
Navigates to `/dashboard/orders/${id}/files` — needs slug prefix.

- Add `useParams`, update navigate calls

### 5. `src/pages/dashboard/OrderFiles.tsx`
Navigates to `/dashboard/orders/new` and `/dashboard/orders/${id}/build` — needs slug prefix.

- Add `useParams`, update navigate calls

### 6. `src/pages/dashboard/OrderBuild.tsx`
Navigates to `/dashboard/orders` and `/dashboard/orders/${id}/files` — needs slug prefix.

- Add `useParams`, update navigate and guardedNavigate calls

## Approach

Each file gets a one-line addition (`const { slug } = useParams()`) and all `/dashboard/` path prefixes become `/t/${slug}/`. This is a mechanical find-and-replace scoped to 6 files. No new components or hooks needed — the slug is already in the URL params from the route definition in App.tsx.

## Implementation order
1. Update CustomerSidebar (nav links)
2. Update all 5 dashboard pages (navigate calls)

