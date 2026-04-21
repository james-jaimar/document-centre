

## Customer Portal — Theme + Branding + Header/Footer pass

The "My Print Centre" view (and every customer-portal page under `/t/:slug/*`) needs four fixes:

1. **Naming** — settle on what we call this whole area
2. **Tenant-branded sidebar** — logo + colours come from the tenant, not hard-coded "printflow"
3. **Sidebar dark theme alignment** with the rest of the UI
4. **A real header + footer** wrapping the print area

---

### 1. Naming — the recommendation

You've been mixing "dashboard", "print area", "print centre". Recommendation, and what we'll standardise on across code, comments, and UI:

- **Customer-facing label**: **"Print Centre"** (the page they land on is "My Print Centre"; the whole portal is "your Print Centre"). Already in use — keep.
- **Internal/code term**: **`printCentre`** for the customer portal area (route segment `/print-centre`, layout `CustomerLayout` becomes the print-centre layout conceptually but we won't rename the file to avoid churn — just align comments).
- **Sidebar nav label**: stays **"Home"** (the home of your Print Centre).

No code rename of files needed beyond what's already done. This is just a naming decision so we stop drifting.

---

### 2. Tenant-branded sidebar (replace "printflow" + green tile)

**File: `src/components/CustomerSidebar.tsx`**

- Remove the hard-coded green `Package` tile + literal `"printflow"` wordmark.
- Pull the tenant from `useTenantFromSlug()` and branding from `useTenantBranding(tenant.id)`.
- Render: `tenant.logo_url` (or `branding.logo_url`) at the top, with `branding.portal_name || tenant.name` as the wordmark beside it.
- For the demo tenant specifically: we'll seed `logo_url` + `portal_name = "Document Centre"` + the marketing palette (navy / blue / sky / green / orange per `mem://design/marketing-brand-tokens`) into `tenants.logo_url` and `tenant_settings (category='branding')` via a small migration so the Demo print centre actually reads "Document Centre" with the proper logo, not "printflow".
- Fallback chain when neither is set: tenant name as text only, no orphan green tile.

**File: `src/components/CustomerLayout.tsx`** — top-bar avatar + user button already exist; we'll feed `displayName` / initials from the profile (already wired) and tint the active-nav pill using the tenant's `primary_color` (CSS variable injected at the layout root).

**Tenant colour injection**: at the root of `CustomerLayoutInner`, set CSS vars `--tenant-primary`, `--tenant-accent` from `useTenantBranding`. Sidebar active item, top-bar accent dot, and the "Home" pill consume these. Default falls back to existing `--sidebar-primary`.

---

### 3. Sidebar dark theme — bring in line with the rest of the app

Right now the customer sidebar uses a custom near-black gradient (`#171c25` → `hsl(var(--sidebar-background))`) which doesn't quite match the admin sidebar (flat `bg-sidebar` from the design tokens).

Fix:
- Drop the custom radial/linear gradient on `.print-sidebar` — switch to `@apply bg-sidebar text-sidebar-foreground border-r border-sidebar-border`, identical to `AppSidebar`.
- Keep the rounded "active pill" treatment that the customer sidebar has (it's nicer than admin's flat one — we'll uplift admin to match in a later pass, not now).
- Active item background: `bg-sidebar-accent` (token, not hard-coded teal).
- User card at bottom: switch from `bg-white/5` to a `bg-sidebar-accent/40` so it reads on the new flat surface.

Net effect: the sidebar is the same dark navy as `/admin` and `/platform`, but with the customer-portal's softer pill nav. Visually consistent across all three portals.

---

### 4. Header + footer for the print area

**Header (`print-topbar` in CustomerLayout)** — currently exists but is anaemic (just search + bell + cart + avatar). Upgrade to:

- Left: tenant logo + portal name (mirrors sidebar, useful when sidebar is collapsed).
- Centre: the existing search.
- Right: bell, cart (with live count from `useCartItemCount`), avatar dropdown with "My Account" / "Sign Out".
- Background: white/80 with backdrop blur (already there) — keep, just polish padding/heights.

**Footer — new** (`<CustomerFooter />` component, mounted at the bottom of `<main>` inside `CustomerLayout`):

- Slim (~44px), border-top, white background, text-muted small.
- Left: `© {year} {tenant.name}` + "Powered by Document Centre" link (small, subtle — this is the SaaS attribution that's important for your sales pitch).
- Centre: links to tenant's `support_email` / `support_phone` if set in `tenant_settings (category='general')`, otherwise hidden.
- Right: links to "Terms" / "Privacy" — route to `/t/:slug/terms` and `/t/:slug/privacy` (placeholder pages for now, just static "Coming soon" so the links don't 404).
- Hidden on `/order/:id/build` and other immersive flows where chrome would distract — controlled by a `hideFooter` prop on routes that need it (we'll start with footer everywhere, then suppress on the order builder if it crowds the UI).

**Layout change** — `CustomerLayout` becomes:

```text
DemoBanner (only when is_demo)
┌──────────────────────────────────────────┐
│ Sidebar │ Header                          │
│         ├─────────────────────────────────┤
│         │ Main (Outlet)                   │
│         │                                 │
│         ├─────────────────────────────────┤
│         │ Footer                          │
└─────────┴─────────────────────────────────┘
```

---

### 5. Demo tenant seed (so it actually shows "Document Centre" branding)

One-off migration:

- `update tenants set logo_url = '/document-centre-logo.svg' where slug='demo';` (we already have this asset at `src/assets/doc-centre-logo.svg` — copy to `public/`).
- Insert `tenant_settings` rows for the demo tenant under `category='branding'`:
  - `portal_name` = `"Document Centre"`
  - `primary_color` = marketing navy
  - `accent_color` = marketing green
  - `secondary_color` = marketing sky-blue
- This is the only tenant we touch — every other tenant keeps whatever they've configured (or empty defaults).

---

### Files changed

- `src/components/CustomerSidebar.tsx` — pull tenant logo + portal name; remove hard-coded printflow wordmark and green tile.
- `src/components/CustomerLayout.tsx` — wire tenant CSS vars; mount `<CustomerHeader />` and `<CustomerFooter />`; richer top bar.
- `src/components/CustomerHeader.tsx` — **new**, extracted from current top-bar block, with tenant logo, search, bell, cart, avatar dropdown.
- `src/components/CustomerFooter.tsx` — **new**.
- `src/index.css` — flatten `.print-sidebar` gradient to use `bg-sidebar` tokens; add `--tenant-primary` consumer rules for active nav.
- `public/document-centre-logo.svg` — copied from `src/assets`.
- New migration: seed demo tenant `logo_url` + branding settings.
- `src/App.tsx` — register `/t/:slug/terms` and `/t/:slug/privacy` placeholder routes.
- `src/pages/dashboard/PortalTerms.tsx` + `PortalPrivacy.tsx` — **new**, minimal stubs.

### Out of scope

- Changing the admin / platform sidebar visual language (separate pass — they're "utilitarian" by spec).
- Per-route footer suppression (we'll add later if a page actually needs it).
- Real legal copy for Terms / Privacy — placeholder pages for now.
- Custom tenant fonts in the print centre (already handled by `BrandingTab`; this change just consumes them).

### Verification

1. Visit `/try` → land in `/t/demo/print-centre` → sidebar shows **Document Centre** logo + name (not "printflow"), navy palette.
2. Sidebar's active "Home" pill uses Document Centre's primary navy/green, not the old teal.
3. Sidebar dark base is the same shade as admin/platform sidebars.
4. New header sits above main content with cart count + avatar dropdown.
5. New footer at bottom: "© 2026 Document Centre Demo · Powered by Document Centre · Terms · Privacy".
6. Sign in to a real tenant (e.g. PostNet) → sidebar shows their logo + name + their branding colours, footer shows their tenant name. No demo styling leaks.

