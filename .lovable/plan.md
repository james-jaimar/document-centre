

# Fix Stale Rendering When Options Change

## Root cause

`react-pageflip` captures DOM nodes at mount time and manipulates them directly for the flip animation. When React updates props on `FlipPage` children (e.g., `effects`, `pageRoles`, border styles), the library does **not** pick up those changes because it holds references to the original DOM elements. This is why the preview looks correct on first load but gets confused as the user toggles options back and forth — borders appear on wrong edges, back cover styling reverts, etc.

## Fix

### 1. Force remount of HTMLFlipBook when effects or page roles change

Add a `key` prop to the `HTMLFlipBook` component that changes whenever the rendering-critical inputs change. This forces React to unmount and remount the entire flip book, ensuring all page DOM nodes are freshly created with current props.

**File: `src/components/preview/FlipBook.tsx`**

- Compute a stable key from the inputs that affect page appearance: `effects` object, `pageRoles` array, and `urls` length
- Use something like: `key={JSON.stringify({ e: resolvedEffects, r: pageRoles, n: urls.length })}`
- This ensures that any option change (covers, bleed, paper color, etc.) triggers a clean re-render

### 2. Reset displayPage when the book remounts

When the `HTMLFlipBook` remounts, its internal page index resets to 0. We need to sync our `displayPage` state accordingly to avoid the viewport/spine logic being out of sync.

**File: `src/components/preview/FlipBook.tsx`**

- Add a `useEffect` that detects when the key changes and resets `displayPage` to `currentPage` (or 0)
- Or more simply: derive the key and let the natural remount + `startPage={0}` handle it, then sync `displayPage` via `onFlip`

### 3. Also key on pageRoles in PreviewPanel

**File: `src/components/order/PreviewPanel.tsx`**

- No changes needed here — the `computedPageRoles` already flows through correctly. The issue is purely at the `HTMLFlipBook` level not re-rendering its captured children.

## Why this works

The library is designed for static page content. By remounting on option changes, we treat each configuration as a fresh book. The flip animation still works smoothly within a configuration — only when the user actually changes an option does the book reset, which is the expected UX (the preview updates to show the new configuration).

## Files to edit
- `src/components/preview/FlipBook.tsx` — add reactive `key` to `HTMLFlipBook`, handle displayPage reset

## Expected result
- Changing any cover, bleed, paper, or lamination option immediately shows the correct rendering
- No stale borders, ghost edges, or mixed styling from previous configurations
- The book resets to page 0 on option change (acceptable UX since the user is reconfiguring)

