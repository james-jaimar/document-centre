
Fix the preview by stabilizing the flipbook’s mount geometry instead of layering more page effects on top.

## Do I know what the issue is?
Yes.

## What the problem actually is
The clear front + navy/black card back is not “breaking the margin logic” directly. It is exposing a deeper problem in `FlipBook.tsx`:

1. `react-pageflip` is very sensitive to the size/position of the HTML pages when it mounts.
2. We currently force a remount with `bookKey` whenever the physical sequence changes.
3. At the same time, the book is mounted inside a wrapper whose width and canvas offset are changing (`viewportWidth`, `canvasOffsetX`, CSS transitions).
4. So when PVC/card pages are added, the library remeasures the book while the stage is in a moving/cropped state.
5. The printable inset then gets captured against the wrong page box, which is why the white borders become larger and drift toward the top/left.

So the root cause is: the flipbook stage is not geometrically stable during remounts. The per-page bleed flags are only a secondary concern.

## Implementation plan

### 1. Make the flipbook stage fixed at all times
In `src/components/preview/FlipBook.tsx`:
- keep the `HTMLFlipBook` mount area at a constant `spreadWidth × pageHeight`
- remove width animation and canvas translate animation from the book mount path
- stop resizing the actual measurement container between solo/spread states

This gives `react-pageflip` one stable box to measure every time.

### 2. Separate “measurement stage” from “what the user sees”
Still in `FlipBook.tsx`:
- keep the library mounted in a stable full-spread stage
- handle solo front/back cover presentation with a static viewport mask/crop layer, not by moving/resizing the library canvas itself
- no transition on the mount container while the book is being recreated

That preserves the current solo-cover UX without corrupting page measurements.

### 3. Replace padding-based paper margins with an absolute printable frame
In `src/components/preview/PageEffects.tsx`:
- stop using inner `padding` as the printable area mechanism
- render printable paper pages with an absolutely positioned inner frame (`inset: bleedInsetPx`)
- render bleed pages edge-to-edge by using `inset: 0`

This makes the white margin a deterministic overlay/frame, not a box-model change.

### 4. Keep material pages on their own rendering path
In `PageEffects.tsx`:
- PVC front/back and card faces remain fully edge-to-edge
- blank simplex backs remain plain paper sheets
- only printable paper pages get the printable-frame treatment

That prevents material pages from ever influencing paper-page spacing.

### 5. Tighten structural resets when the page model changes
In `src/components/order/PreviewPanel.tsx` and/or `DocumentPreview.tsx`:
- clamp/reset `currentPage` whenever the physical sequence length changes
- ensure option changes that insert/remove PVC/card faces never leave the preview on an invalid or stale spread index

This removes another source of odd spread state after cover changes.

## Files to update
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/PageEffects.tsx`
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/DocumentPreview.tsx` (only if page-sync handling is cleaner there)

## Expected result
- clear/frosted PVC continues to behave correctly
- selecting clear front + navy/black card back no longer blows out the margins
- white borders stay symmetric and stable during repeated option changes
- simplex blank backs still render as plain white sheets
- card backs stay truly edge-to-edge

## Technical note
The key fix is not another overlay tweak. It is removing this unstable pattern from the flipbook mount path:

```text
sequence changes -> book remounts -> wrapper width/offset also changes -> pageflip measures an in-between box
```

After the fix, it becomes:

```text
sequence changes -> book remounts inside the same fixed stage every time
```
