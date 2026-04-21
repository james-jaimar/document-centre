

## Print Centre — proper Header, Footer, and prettier Sidebar

The print centre right now feels like a stripped-down app shell with a search-bar pretending to be a header and no footer. We're going to make it feel like a real branded site — same chrome quality as the public Document Centre homepage — but tenant-aware.

---

### 1. Top bar → proper Header (mirrors the marketing site)

Replace the current `print-topbar` (search + bell + cart + small logo + avatar) with a real header modelled on the public homepage:

- **Tall, white, sticky**, ~88px (vs current 64px), bottom border, subtle backdrop blur — same proportions as `MarketingLanding`.
- **Left**: tenant logo at proper size (`h-12`, max-width ~200px). For the demo tenant that's the full-size Document Centre mark, not the tiny chip we have now. No "Document Centre" wordmark beside it — the logo already contains it.
- **Centre**: nav links — `Home` · `Create` · `Orders` · `Cart` · `My Account`. These mirror the sidebar so navigation works without it (and are useful on mobile when the sidebar is closed). Active link gets a tenant-primary underline.
- **Right**: 
  - Cart icon with live count badge (keep — it works).
  - User avatar dropdown (keep — it works) with My Account / My Orders / Sign Out.
  - **Remove**: search input (you don't want it), notifications bell (doesn't work yet — bring back when it does), and the small duplicate logo in the top bar.
- Tenant accent: the "Try it now" / login pill style from marketing becomes a subtle `bg-tenant-primary` underline on the active nav item.

---

### 2. New Footer (mirrors the marketing site, slimmer)

Replace the current 3-column slim footer with one that looks like the public footer but in a single compact band:

- White background, top border, ~80px tall.
- **Left**: small tenant logo + `© {year} {tenant.name}`.
- **Centre**: nav links — `Home` · `Create an Order` · `My Orders` · `My Account` · `Help`. Plus, when set, `support_email` / `support_phone` chips (from `tenant_settings.general`).
- **Right**: small "Powered by Document Centre" link (only shown for non-demo tenants — this is your SaaS attribution play), and `Terms` · `Privacy` links.
- Optional row below: socials (LinkedIn / Mail) only if the tenant has set them — hidden otherwise. (Demo will not show socials.)
- Visible on every print-centre page (we previously suggested hiding on the order builder; not doing that now — keep consistent).

---

### 3. Sidebar polish

Keep the dark sidebar — it's correct and matches admin/platform — but make it feel less hard-coded:

- **Logo block**: drop the awkward truncated text fallback. Show the tenant logo at `h-10`, no extra wordmark, with proper top padding so it breathes.
- **Active pill**: currently solid tenant-primary which can look dense. Switch to a softer `bg-tenant-primary/85` with a subtle 2px left accent bar in tenant-accent — gives it a more refined feel and ties the brand colour in twice.
- **Nav items**: tighten vertical rhythm (gap 1.5 instead of 2), slightly smaller font (14px), more pill-like radius. Closer to the marketing site's nav weight.
- **User card** at the bottom: replace the warning-yellow circle (looks like a notification) with a proper avatar — initials on `bg-tenant-primary/30` with `text-sidebar-foreground`, matching the header's avatar style. Remove the orphan `HelpCircle` icon — it does nothing.
- **Background**: keep `bg-sidebar` token (consistent with admin) but add a very subtle inner gradient `from-sidebar to-sidebar/95` so it doesn't read as a flat black wall.

---

### 4. Layout adjustments

`CustomerLayout`:
- Header sits above the sidebar+content row (full-width across the top), not next to the sidebar. This matches the public site and means the tenant logo dominates the whole top edge — much more "we are this brand" feel.
- Sidebar starts below the header.
- Footer spans full width below the content.
- Demo banner (when present) sits above everything, as today.

```text
DemoBanner (if demo)
┌──────────────────────────────────────────┐
│ Header (full width, tall, tenant logo)   │
├─────────┬────────────────────────────────┤
│ Sidebar │ Main (Outlet)                  │
│         │                                │
├─────────┴────────────────────────────────┤
│ Footer (full width)                      │
└──────────────────────────────────────────┘
```

This is the change the user is asking for — a proper bordered "site" feel rather than an "app shell".

---

### Files changed

- `src/components/CustomerHeader.tsx` — rewrite: full-width, tall, tenant logo prominent, centre nav, no search, no bell, cart + avatar dropdown only.
- `src/components/CustomerFooter.tsx` — rewrite: marketing-inspired layout, tenant nav links, "Powered by Document Centre" attribution (hidden on demo), socials only when configured, Terms/Privacy.
- `src/components/CustomerLayout.tsx` — restructure: Header on top, then `[Sidebar | Main]` row, then Footer. Mobile menu trigger moves into the header on small screens.
- `src/components/CustomerSidebar.tsx` — polish logo block, refined active pill (with left accent bar), tightened nav rhythm, proper user card avatar, removed `HelpCircle`.
- `src/index.css` — `.print-topbar` becomes the new tall header style; add `.sidebar-nav-item.active::before` left accent bar; subtle sidebar gradient.

### Out of scope

- Wiring real notifications (we're hiding the bell until the feature exists).
- Adding a working global search (you said you don't want it).
- Touching the marketing landing page — it's already good and shouldn't change.
- Touching admin/platform sidebars.
- Real legal copy — Terms/Privacy stay as the placeholder pages we already created.

### Verification

1. Open `/try` → land in `/t/demo/print-centre`.
2. Header spans the full page width, ~88px tall, white, with the **full Document Centre logo** dominating the top-left (no tiny chip duplicate). Cart + avatar on the right. No search field. No bell.
3. Centre nav shows `Home / Create / Orders / Cart / My Account`. Active item underlined in Document Centre navy/green.
4. Sidebar starts under the header, dark, with refined active-pill (left accent bar in green), proper avatar in the user card (no yellow circle).
5. Footer at the bottom with `© 2026 Document Centre Demo · nav links · Terms · Privacy`. **No** "Powered by Document Centre" on the demo (it would be tautological); it would appear for a real tenant like PostNet.
6. Sign in to a real tenant — same layout, swapped logo/colours, "Powered by Document Centre" appears in the footer.

