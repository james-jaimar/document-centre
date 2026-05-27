# Mobile-first customer portal

Scope: every route under `/t/:slug/*` for the customer-facing portal. Admin, branch and platform portals are left untouched. Desktop layouts are preserved at `md+` breakpoints — this is purely an additive mobile shell + per-screen `< md` layouts.

## The problem today

Looking at a live tenant (e.g. posnetprintcentre.com), the current customer portal:

- Renders the full desktop `print-topbar` at all widths — logo + branch picker + sign-in overflow horizontally on a phone.
- The hamburger triggers a non-functional empty `<div className="print-sidebar">` overlay (look at `CustomerLayout.tsx` line 189 — there's no `<CustomerSidebar />` inside it).
- Storefront landing, dashboard tiles, configurator steps, cart, checkout forms and admin-style tables are all built for ≥1024px and just shrink badly.
- Sidebar collapse logic, footer columns, branch picker dialog, and the order configurator all assume a wide viewport.

The decision: treat mobile as its own first-class experience with a different shell, not a shrunk desktop.

## Mobile shell — the foundation

Replace the mobile branch of `CustomerLayout.tsx` with a dedicated shell, gated by `useDeviceKind() === "mobile"` (already exists, requires coarse pointer + narrow width — protects tablets/small desktop windows).

```text
┌──────────────────────────┐
│  ☰  [logo]      🛒  👤  │   sticky compact header (56px)
├──────────────────────────┤
│                          │
│   page content           │   safe-area padded, bottom padding
│   (single column)        │   for the tab bar
│                          │
├──────────────────────────┤
│ 🏠   ＋    📋   👤        │   bottom tab bar (Home/Create/Orders/Account)
└──────────────────────────┘
```

Pieces:

1. **`CustomerMobileLayout.tsx`** — new file. Renders compact header, `<Outlet />`, and bottom tab bar. Replaces the sidebar + topbar entirely on mobile.
2. **`MobileHeader.tsx`** — 56px sticky header. Left: hamburger that opens a shadcn `Sheet`. Center: tenant logo (max-h-9, truncated portal name fallback). Right: cart icon + avatar. Branch picker becomes a single-line chip under the header only when `isMultiBranch`.
3. **`MobileNavSheet.tsx`** — slide-in `Sheet` for full nav (Home, Create, Orders, Quotes, Cart, Account, Sign in/out, branch switcher). Replaces the broken empty overlay.
4. **`MobileTabBar.tsx`** — fixed bottom, 4 tabs with icon + label, active state uses tenant primary, respects `env(safe-area-inset-bottom)`. Hidden on `/checkout` and the order configurator's later steps to avoid covering primary CTAs.
5. **Layout switching**: `CustomerLayout.tsx` early-returns `<CustomerMobileLayout>` when `useDeviceKind() === "mobile"`. All existing branding bootstrap, anonymous session, branch context and chat widget logic is shared.
6. **Chat widget**: shift Tawk launcher up by tab-bar height on mobile so it doesn't sit behind the tab bar.

## Per-screen mobile layouts

Each screen gets a mobile-tailored render path. Where the desktop layout is already largely single-column, we tighten spacing and stack; where it's multi-column or table-driven, we restructure.

### Storefront landing & print-centre home
- Hero: stacked text + single CTA, no side art on phone.
- Product tiles: horizontal-scroll carousel of `product-tile`s instead of grid (snap, hide scrollbar).
- Trust/feature blocks: stacked cards with full-width imagery, generous vertical rhythm.
- Tenant facsimile header/footer: shown only on landing, collapsed behind a "View full site" expandable on mobile so the scraped HTML doesn't break the viewport.

### Customer dashboard (`CustomerDashboard.tsx`)
- Greeting + stat strip becomes 2×2 stat grid (or horizontal scroll if 5+ cards).
- "Recently uploaded" and "Recent activity" lists become full-width cards with thumbnails left, meta right, single-line title with ellipsis.
- Quick actions condensed into a sticky "+ New order" FAB that mirrors the Create tab bar action.

### Order configurator (`OrderFiles.tsx` + product-specific steps)
The biggest piece. Today it's a side-by-side configurator. On mobile:

- **One step per screen** in a wizard flow with a thin progress bar at the top (e.g. Files → Size → Options → Sections → Review).
- Each step is a full-height scrollable panel with sticky action bar at the bottom ("Back / Continue"). The bottom tab bar is hidden inside the configurator to free space.
- File upload: full-width drop zone, big touch-friendly file rows with thumbnails. QR mobile upload banner is hidden (we're already on mobile).
- Options pickers (size, colour, sides, binding): switch from inline radio grids to large tap cards.
- Section list (bound documents): reorderable list using long-press drag, not 4-column desktop grid.
- Preview: opens in a full-screen modal sheet, not inline alongside.
- Photo prints already has its mobile pass — re-use its patterns (`PhotoTile`, `PhotoUploader`) as the visual reference for the rest of the configurator.

### Cart (`Cart.tsx`)
- Each cart line becomes a full-width card: thumbnail + title, qty stepper, price right-aligned, swipe-or-tap-to-delete.
- Totals + promo + checkout CTA become a sticky bottom panel above the tab bar.

### Checkout (`Checkout.tsx`)
- Convert the multi-column form into a single-column wizard: Address → Shipping → Payment → Review.
- Inputs at 16px font-size minimum (prevents iOS zoom-on-focus).
- `CheckoutAuth` inline auth becomes a bottom-sheet rather than a side panel.

### Orders / Quotes / Quote detail / Order detail
- Replace tables with card lists (order #, status pill, total, date, chevron).
- Detail pages: collapsible accordions per section (Items, Files, Shipping, Timeline, Messages) instead of multi-column dashboards.
- Timeline component: vertical with smaller spacing and condensed message bubbles.

### Account / Settings / Addresses
- Tabs become a stacked list of "setting groups" that push to sub-screens (iOS-style).
- Address book: card list with primary-address badge; add/edit in a full-screen sheet.

### Auth, Verify, Reset, Order confirmation, Portal terms/privacy
- Centered single-column at all sizes; just tighten padding, font sizes and ensure the logo + CTAs fit a 360px viewport.

## Visual & interaction rules

- **Breakpoint**: drive the shell switch off `useDeviceKind()` (mobile = coarse pointer + `<900px`). Tailwind `md:` (768px) still gates internal layout flips.
- **Tap targets**: 44×44 minimum; bump `size="icon"` shadcn buttons with `min-h-11 min-w-11`.
- **Typography**: keep glassmorphic Printflow tokens, but tighten heading scales (`text-2xl` mobile vs `text-4xl` desktop) and reduce `p-6 xl:p-8` to `px-4 py-5` on the main content wrapper.
- **Safe areas**: header gets `pt-[env(safe-area-inset-top)]`, tab bar gets `pb-[env(safe-area-inset-bottom)]`, scroll content gets bottom padding equal to tab-bar height (`pb-20`).
- **Motion**: use existing Tailwind transitions; no new animation lib.
- **Tokens only**: no raw colours; reuse `--tenant-primary/--tenant-accent` so white-labelling holds on mobile too.
- **Accessibility**: each tab has an `aria-label`, the hamburger button gets a visible label inside the sheet, focus rings preserved.

## Technical notes (for the developer)

- New files (mobile-only):
  - `src/components/customer/mobile/CustomerMobileLayout.tsx`
  - `src/components/customer/mobile/MobileHeader.tsx`
  - `src/components/customer/mobile/MobileNavSheet.tsx`
  - `src/components/customer/mobile/MobileTabBar.tsx`
  - `src/components/customer/mobile/MobileBranchChip.tsx`
  - `src/components/customer/mobile/MobileWizardShell.tsx` (used by configurator + checkout)
- Modified:
  - `src/components/CustomerLayout.tsx` — early-return mobile shell; remove the dead empty-sidebar overlay.
  - `src/components/CustomerFooter.tsx` — render a compact mobile footer (legal links only) inside the mobile shell.
  - Page-level files listed above get a small mobile branch via `useDeviceKind()` or a `MobileX` sub-component; desktop renders untouched.
  - `src/index.css` — add `.mobile-tabbar`, `.mobile-header`, safe-area utilities, and tweak `.customer-body` padding for mobile.
- Chat widget z-index and `bottom` offset adjusted in `TenantChatWidget.tsx` so it floats above the tab bar.
- No backend / data changes. No schema or RLS work. No new dependencies.

## Out of scope (explicit)

- Admin (`/admin/*`), Branch (`/branch/*`) and Platform (`/platform/*`) portals.
- Marketing site (`/`, `/pricing`, `/contact`) — covered in the existing `.dc-marketing` system, separate effort.
- New product features, pricing changes, configurator semantics — purely presentation.
- Native app shell (Capacitor) — not requested.

## Suggested build order

1. Mobile shell + bottom tab bar + sheet menu, with all existing pages rendered as-is inside it (instant baseline win — fixes the broken hamburger and overflowing header).
2. Dashboard + storefront landing mobile layouts.
3. Cart + checkout wizard.
4. Order configurator wizard (largest piece; do per product family if needed).
5. Orders, quotes, account, settings — card lists + accordions.
6. Polish pass: typography, safe areas, chat-widget offset, QA on 360 / 390 / 414 widths.
