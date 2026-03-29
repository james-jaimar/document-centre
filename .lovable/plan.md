

# Auto-Open Drawer + Visual Highlight on Tab/Insert Selection

## What needs to change

Two UX improvements so non-technical users discover the management UI immediately:

### 1. Auto-open the drawer when tabs or inserts are first enabled

In `OrderBuild.tsx`, add a `useEffect` that watches `tabInfo` and `insertEnabled`. When either transitions from falsy to truthy (user selects a tab or insert option for the first time), automatically call `setDrawerOpen(true)`.

Track previous values with a ref to detect the transition — only auto-open on change, not on page load with existing selections.

### 2. Highlight the "Manage Tabs & Inserts" button

When the drawer is closed and tabs/inserts are enabled, apply an animated attention style to the button — a green/primary pulse or highlighted border — so users know where to go. Once clicked (drawer opened), remove the highlight.

Use a `hasOpenedDrawer` state flag. While `false` and tabs/inserts are enabled, the button gets `animate-pulse` plus a colored ring. Set to `true` once the drawer opens.

## File to edit

- `src/pages/dashboard/OrderBuild.tsx` — add auto-open effect + highlight state on the button

## Expected result

- Selecting "5-Tab Dividers" from the dropdown immediately slides open the right drawer
- The "Manage Tabs & Inserts" button pulses with a highlight until first clicked
- Returning to the page with existing tabs does not auto-open (only triggers on fresh selection)

