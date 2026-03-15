

# Updated Plan: Customer Portal with Dedicated Layout & Printflow Design

## Key Change from Original Plan

The customer portal (`/dashboard/*`) gets its **own layout and sidebar**, completely separate from the admin/branch/platform shell. An admin user visiting `/dashboard` will see only the customer sidebar -- not the full multi-section admin sidebar.

## Architecture

```text
/dashboard/*  →  CustomerLayout (CustomerSidebar + TopBar + Outlet)
/branch/*     →  AppLayout (AppSidebar -- unchanged)
/admin/*      →  AppLayout (AppSidebar -- unchanged)
/platform/*   →  AppLayout (AppSidebar -- unchanged)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/index.css` | Edit | Add printflow CSS variables, body gradient background, utility classes: `glass-card`, `product-tile`, `upload-dropzone`, `section-card`, `section-header`, `soft-button` |
| `src/components/CustomerSidebar.tsx` | Create | Customer-only sidebar: dark gradient background, rounded nav items with teal active state, brand logo, user card at bottom. Nav items: Dashboard, My Orders, Account only |
| `src/components/CustomerLayout.tsx` | Create | Layout shell for `/dashboard/*`: CustomerSidebar + top bar (search, notifications, cart, user avatar) + gradient background main area + `<Outlet />` |
| `src/pages/dashboard/CustomerDashboard.tsx` | Edit | Restyle with glass-card product picker, product-tile grid with gradient icon containers, taller upload-dropzone with cloud icon, section-card tables for recent orders and tracking |
| `src/App.tsx` | Edit | Split routing: customer routes (`/dashboard/*`) use `CustomerLayout`, everything else keeps `AppLayout` |

## Design Details

- **CustomerSidebar**: Dark gradient (`#1a1f2e` to `#171c25`), subtle blue glow at bottom. Nav items are `rounded-2xl` with `hover:bg-white/10`. Active state uses teal accent. Brand icon with green gradient. Collapsible.
- **Top bar**: White/80 backdrop-blur, sticky. Search pill on left. Right side: notification bell (green dot), cart (amber badge), user avatar dropdown.
- **Body background**: Subtle radial gradients (teal top-left, blue top-right) over a light linear gradient.
- **Cards**: `glass-card` = `rounded-3xl border-white/60 bg-white/80 shadow backdrop-blur`. Product tiles use gradient slate thumbnails, hover lifts.
- **Upload zone**: `min-h-[220px] rounded-3xl border-2 border-dashed` with gradient background, large cloud icon.

## Routing Change in App.tsx

Customer routes get wrapped in a new `CustomerLayout` element instead of `AppLayout`:

```text
<Route element={<ProtectedRoute><CustomerLayout /></ProtectedRoute>}>
  /dashboard
  /dashboard/orders
  /dashboard/orders/new
  /dashboard/orders/:id/files
  /dashboard/orders/:id/build
  /dashboard/settings
</Route>

<Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
  /branch/*
  /admin/*
  /platform/*
</Route>
```

This ensures the admin sidebar only appears on admin routes, and the customer portal always shows its own clean, styled sidebar regardless of the user's roles.

