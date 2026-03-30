

# Ensure Tabs & Inserts drawer never auto-opens

## Investigation

The code already sets `drawerOpen` to `false` initially, and there is no `useEffect` or other logic that auto-opens it. The only trigger is the button's `onClick`. This suggests either a stale cached build was running, or there's a subtle race condition.

## Defensive fix

To guarantee the drawer cannot appear on page load, regardless of caching or timing:

### File: `src/pages/dashboard/OrderBuild.tsx`

1. **Don't render the `TabInsertDrawer` at all until the user has clicked the button.** Change the render from always mounting the `Sheet` (which can flash briefly on some browsers) to only mounting it after `hasOpenedDrawer` becomes `true`:

```tsx
{hasOpenedDrawer && (
  <TabInsertDrawer
    open={drawerOpen}
    onOpenChange={setDrawerOpen}
    ...
  />
)}
```

2. This way the `Sheet` component is never in the DOM until the user explicitly clicks "Manage Tabs & Inserts", eliminating any possibility of it appearing on load.

## What stays the same
- The pulsing "Manage Tabs & Inserts" button still appears when tabs/inserts are enabled
- Clicking it sets `hasOpenedDrawer = true` and `drawerOpen = true`
- All drawer functionality remains identical

