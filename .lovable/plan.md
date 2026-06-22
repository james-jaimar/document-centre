## Problem

On `/sandton-city/orders/<id>/build/` the header's "branch" chip does nothing. The chip calls `openPicker()`, which flips `pickerOpen=true`, but `BranchPicker.tsx` short-circuits to `null` whenever the URL matches `\/(orders|quotes)\/<uuid>` — which includes every sub-route like `/build`, `/files`, etc. So an explicit user click is silently swallowed.

That route-suppression was added to stop the picker auto-opening on a resource page where the active branch is derived from the resource itself. It shouldn't block a user who deliberately taps the chip to switch branches.

## Fix

Separate **auto-open** (suppressed on resource routes) from **manual open** (always honoured).

### Changes

1. **`src/contexts/BranchContext.tsx`**
   - Track open intent: `const [pickerOpen, setPickerOpen] = useState<false | 'auto' | 'manual'>(false)`.
   - `openPicker()` → `setPickerOpen('manual')`.
   - The auto-open branch in the resolve effect (`if (!activeBranch) setPickerOpen('auto')`).
   - `selectBranch` / `closePicker` set it back to `false`.
   - Expose `pickerOpenMode` (or just keep `showPicker` as the boolean and add `pickerManual`) so the picker can tell the two apart.

2. **`src/components/BranchPicker.tsx`**
   - Remove the `RESOURCE_BRANCH_ROUTE_RE` early-return.
   - Suppress only when the open was automatic AND the route is a resource detail page: `if (pickerOpenMode === 'auto' && RESOURCE_BRANCH_ROUTE_RE.test(location.pathname)) return null;`
   - Manual opens always render, regardless of route.

3. **No change** to `CustomerHeader.tsx` / `MobileNavSheet.tsx` — they already call `openPicker()`. After the fix, clicking the chip from `/orders/<id>/build/` opens the modal; choosing a branch navigates to `/<new-branch-slug>` (or `/t/<tenant>/<new-branch-slug>`), which already exists in `handleSelect`.

### Out of scope

- No DB / RLS changes.
- No change to which branches are listed (still live-only, multi-branch only).
- No styling changes.

### Verification

- Manually open the picker from `/sandton-city/orders/<id>/build/` — modal appears, branch selection navigates to the new branch's home.
- Land on `/sandton-city/orders/<id>` with no active branch in localStorage — picker does **not** auto-pop (resource page still resolves branch from the order).
- Land on `/print-centre` with no active branch — auto-open still works (unchanged).