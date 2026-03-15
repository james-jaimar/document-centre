

# Customer Dashboard Revamp

## What We're Building

A modern, functional customer home page at `/dashboard` that replaces the current placeholder with a Mimeo-inspired layout -- product type picker across the top, drag-drop upload zone, recent files, recent orders, and order tracking -- all wired to live Supabase data.

## Layout

```text
┌─────────────────────────────────────────────────────────┐
│  Welcome back, {name}                                   │
├─────────────────────────────────────────────────────────┤
│  GET STARTED — CHOOSE A PRODUCT                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│  │ icon │ │ icon │ │ icon │ │ icon │ │ icon │  ...     │
│  │Bound │ │Pres. │ │Ring  │ │Stapl │ │Post  │         │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘         │
├─────────────────────────────────────────────────────────┤
│  QUICK UPLOAD                                           │
│  ┌─────────────────────────────┐  ┌─────────────────┐  │
│  │  Drag & drop PDFs here,    │  │ RECENT UPLOADS  │  │
│  │  or browse                 │  │ file1.pdf  [→]  │  │
│  │                            │  │ file2.pdf  [→]  │  │
│  └─────────────────────────────┘  └─────────────────┘  │
├──────────────────────┬──────────────────────────────────┤
│  RECENT ORDERS       │  ORDER TRACKING                  │
│  Order #1234  Draft  │  #1230  Printing   Track →      │
│  Order #1231  Ready  │  #1228  Shipped    Track →      │
│  [View All →]        │                                  │
└──────────────────────┴──────────────────────────────────┘
```

## Implementation Details

### 1. Revamp `CustomerDashboard.tsx`

- **Product picker strip**: Query `product_families` (active, sorted). Render as horizontal scrollable card row with icons. Clicking creates a draft order via `useCreateOrder` and navigates to `/dashboard/orders/:id/files` (same as `NewOrder.tsx` logic).
- **Quick upload zone**: A simplified `FileUploader` drop zone. Since we need an order context to upload, dropping a file here will prompt the user to pick a product type first (or auto-select if only one exists), create the order, then redirect to the files page.
- **Recent uploads**: Query `documents` for the current user, ordered by `created_at desc`, limit 5. Each row shows filename, date, and a "Create" button that navigates to order creation.
- **Recent orders**: Query `orders` joined with `order_items` for the current user, `created_at desc`, limit 5. Show order title/id, status badge, date, and "Continue" or "View" action.
- **Order tracking**: Same `orders` query filtered to non-draft statuses (`printing`, `shipped`, `ready_for_collection`). Show status, tracking info if available.

### 2. Flesh out `CustomerOrders.tsx`

- Query all `orders` for the current user with `order_items` join
- Table view: Order #, product type, status badge, date, total price, action button
- Status filter tabs: All, Draft, In Progress, Completed
- Click row navigates to `/dashboard/orders/:id/files` (draft) or `/dashboard/orders/:id/build` (building+)

### 3. Sidebar already handles navigation

The existing `AppSidebar` already has Dashboard, My Orders, and Account links for the customer section -- no changes needed there.

## File Changes

| File | Action |
|------|--------|
| `src/pages/dashboard/CustomerDashboard.tsx` | Major rewrite -- product strip, upload zone, recent orders, tracking |
| `src/pages/dashboard/CustomerOrders.tsx` | Rewrite -- full orders table with status filters |

No new routes, hooks, or migrations needed. Uses existing `useCreateOrder` from `useOrderBuilder`, existing queries on `orders`/`order_items`/`product_families`/`documents` tables.

