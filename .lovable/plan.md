

# Render First, Display Second — Fixed Internal Resolution

## The real problem

The flipbook's `pageWidth` and `pageHeight` are recalculated from the container size on every resize/zoom. This means:

1. `react-pageflip` receives different `width`/`height` props each time
2. `bleedInsetPx = Math.round(pageWidth * 0.03)` produces different pixel values
3. The library remeasures its internal canvas against the new dimensions
4. During transitions (cover changes, option changes), the container is also resizing, so the library captures an intermediate state

This is why zoom breaks everything and why cover changes cause margin drift — both change the container size that feeds into the flipbook geometry.

## The fix: fixed internal resolution + CSS scale

Render the flipbook at a **constant internal resolution** (e.g. 350×495 for A4 ratio). Then use `transform: scale(factor)` to fit it into whatever container size is available. The library always sees identical pixel dimensions regardless of viewport, zoom, or container changes.

```text
Current (broken):
  container resizes → pageWidth changes → library remeasures → margins drift

Fixed:
  container resizes → scale factor changes → CSS zoom only → library untouched
```

### Changes to `FlipBook.tsx`

1. Compute a fixed `BASE_PAGE_WIDTH` (e.g. 350px) and derive `BASE_PAGE_HEIGHT` from the aspect ratio — these never change for a given document
2. Compute `bleedInsetPx` from the fixed base width — it's now a constant
3. Compute `spreadWidth = BASE_PAGE_WIDTH * 2` — also constant
4. Calculate `scaleFactor = Math.min(availableWidth / viewportWidth, availableHeight / basePageHeight)` where `availableWidth/Height` come from the container props
5. Wrap the entire flipbook stage in a `transform: scale(scaleFactor)` with `transform-origin: top center`
6. The outer container sets its dimensions to the scaled result

### Changes to `PageEffects.tsx`

None needed — it already uses `bleedInsetPx` as an absolute pixel value. Once that value stops changing, margins are stable forever.

### Changes to `PreviewPanel.tsx`

None needed — it already passes container dimensions down. The flipbook will simply use them for scale calculation instead of page sizing.

### What this solves

- **Zoom/viewport changes**: scale factor adjusts, internal geometry stays identical
- **Cover option changes**: library remounts at the same fixed size every time
- **Margin drift**: `bleedInsetPx` is computed once from a constant base width, never recalculated
- **The "render first, display second" principle**: the flipbook is rendered at a fixed resolution, then displayed at whatever size fits

## Files to edit

- `src/components/preview/FlipBook.tsx` — fixed base dimensions + CSS scale wrapper

## Expected result

- Changing browser zoom scales the preview smoothly without breaking layout
- Adding/removing PVC covers or card backs never shifts margins
- `bleedInsetPx` is a constant for any given aspect ratio
- The flipbook is immune to container size changes

