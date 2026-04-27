## Goal

Make the **Configure Your Document** page fit the visible viewport with no outer page scroll. The Options column and the Preview column should each scroll internally if their content overflows, but the page itself should not.

## Root cause

In `src/pages/dashboard/OrderBuild.tsx` (line 724) the root container uses:

```tsx
<div className="space-y-2 flex flex-col" style={{ minHeight: "calc(100vh - 9rem)" }}>
```

`100vh - 9rem` is a **guess** at the space taken by the header + footer + main padding. The real available height varies:

- `CustomerHeader` (~64px) + `CustomerFooter` (~70px) + optional demo banner + `<main>` padding `p-6 xl:p-8` (24–32px top & bottom) = often more than 9rem (144px).
- When the guess underestimates the chrome, the panel grows taller than the viewport and the user has to scroll — exactly what the screenshot shows (preview spills below the fold).

The good news: `CustomerLayout` already uses `flex h-screen` with `<main className="flex-1 overflow-auto">`. So if `OrderBuild` simply fills its parent with `h-full`, it will be perfectly bounded with no math.

## Changes

### 1. `src/pages/dashboard/OrderBuild.tsx` (line 724)

Replace the magic-number height with a parent-fill height, and tighten the layout:

```tsx
<div className="h-full flex flex-col space-y-2 min-h-0">
```

- `h-full` → fill the `<main>` content area exactly (no guesswork).
- `min-h-0` → allows the inner `flex-1` grid to shrink and trigger internal scroll instead of pushing the page.
- Drop the inline `style` entirely.

### 2. `src/components/CustomerLayout.tsx` (line 156)

Tighten `<main>` padding only on the OrderBuild route so we reclaim ~32px vertical and ~32px horizontal for the preview. Two options — pick (a) for minimal blast radius:

**(a)** Leave global padding alone, and inside `OrderBuild.tsx` add a negative margin / wrapper that resets padding:

```tsx
<div className="-m-6 xl:-m-8 h-[calc(100%+3rem)] xl:h-[calc(100%+4rem)] ...">
```

This keeps the change scoped to one page and avoids touching the layout used by every other customer route.

### 3. (Optional polish) `src/pages/dashboard/OrderBuild.tsx` header row

Header is already compact (`text-lg` + `text-xs`). No change needed unless we still need a few more pixels — in which case wrap it in `py-1` and we recoup another 8px.

## Result

- The configure page will now be exactly the height of `<main>`, no more, no less.
- The Options card and Preview card will each scroll internally only if their own content overflows — the page never scrolls.
- The expand-to-fullscreen button still works as before for users who want a maximised lightbox.

## Files touched

- `src/pages/dashboard/OrderBuild.tsx` — root container only (1 line + remove inline style)

No changes needed in `CustomerLayout.tsx` if we use the negative-margin trick in step 2(a), keeping the diff to a single file.
