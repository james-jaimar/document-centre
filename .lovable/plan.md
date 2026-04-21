

## Fix: Sidebar picks up tenant branding colours

### Problem

The sidebar background is hard-coded to `hsl(var(--sidebar-background))` -- the generic dark theme token. The tenant's `primary_color`, `secondary_color`, and `accent_color` from branding settings are injected as CSS variables (`--tenant-primary`, `--tenant-accent`, `--tenant-secondary`) but only consumed by the active nav pill and its accent bar. The sidebar surface itself never changes per-tenant.

### Fix

**1. Sidebar background uses tenant primary colour** (`src/index.css`)

Change `.print-sidebar` to use the tenant's primary colour as the sidebar background, falling back to the existing `--sidebar-background` token when no branding is set:

```css
.print-sidebar {
  background: linear-gradient(
    180deg,
    hsl(var(--tenant-primary, var(--sidebar-background))) 0%,
    hsl(var(--tenant-primary, var(--sidebar-background)) / 0.92) 100%
  );
}
```

This gives each tenant a distinct sidebar colour (Document Centre = navy `#0B2A66`, PostNet = their brand colour) while keeping the same dark feel.

**2. Active nav pill adjusts for branded sidebar** (`src/index.css`)

With the sidebar now branded, the active pill needs to contrast against it. Switch from using `--tenant-primary` (which is now the background) to using `--tenant-accent` for the active state, falling back to a lighter shade:

```css
.sidebar-nav-item.active {
  background: hsl(var(--tenant-accent, var(--sidebar-accent)) / 0.85);
}
```

The left accent bar keeps using `--tenant-accent` as it already does.

**3. User card avatar tints** (`src/components/CustomerSidebar.tsx`)

The user card avatar circle already uses `--tenant-primary` -- since that's now the sidebar background, switch it to `--tenant-accent` so it's visible:

```css
background: hsl(var(--tenant-accent, var(--tenant-primary, var(--sidebar-accent))) / 0.35)
```

### Files changed

- `src/index.css` -- `.print-sidebar` background uses `--tenant-primary`; `.sidebar-nav-item.active` uses `--tenant-accent`.
- `src/components/CustomerSidebar.tsx` -- user card avatar background uses `--tenant-accent`.

### Verification

1. Demo Print Centre sidebar is Document Centre navy (`#0B2A66`), not generic black.
2. Active nav pill is green (`#34B34A` accent), visible against navy background.
3. A tenant with no branding configured falls back to the standard `--sidebar-background` dark theme -- no breakage.

