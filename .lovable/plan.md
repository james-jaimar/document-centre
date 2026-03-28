

# Add Drop Shadow to FlipBook Pages

## Problem
White paper pages are invisible against the white preview background — no visible edge.

## Solution
Add a subtle `box-shadow` to the outer `<div>` of each `FlipPage` component, giving every page a soft edge outline similar to Mimeo's approach.

## File to edit

**`src/components/preview/FlipBook.tsx`** — Line 32, the FlipPage root div. Add a subtle box-shadow:
```
boxShadow: "0 1px 4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)"
```
This gives a soft drop shadow plus a barely-visible 1px border, making white pages clearly distinguishable from the background regardless of paper color.

