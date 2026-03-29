
Do I know what the issue is? Yes.

## What the problem actually is

This is no longer a “bleed flag” problem first. The real issue is that the flipbook is still being measured inside a moving viewport.

In `src/components/preview/FlipBook.tsx`, the `HTMLFlipBook` stage is still tied to:
- changing outer width (`viewportWidth`)
- animated width transition
- animated left offset
- `clipPath` cropping on the same visual path

When PVC/card options are added, the physical page sequence changes, the book remounts, and `react-pageflip` / StPageFlip measures while that container is in a shifted/cropped state. That is why the “margins” appear to jump top/left and clip on bottom/right: the page box itself is being captured off-position.

There is a second issue making this worse:
- `bookKey` remounts the whole flipbook for every `resolvedEffects` change, even visual-only changes
- so the unstable measurement path happens far more often than it should

The docs/search support this diagnosis:
- StPageFlip measures parent block size (`getBlockWidth` / `getBlockHeight`)
- the common fix for size changes is remounting with a `key`
- that only works reliably if the measured container is geometrically stable at mount time

## Clean fix

### 1. Make the pageflip measurement container completely static
In `src/components/preview/FlipBook.tsx`:
- keep one permanent spread-sized stage for `HTMLFlipBook`
- remove width transition, left transition, and clip-path logic from the measured stage path
- do not animate or shift the element the library uses for sizing

### 2. Separate the viewer viewport from the measured stage
Still in `FlipBook.tsx`:
- introduce a separate outer “viewer” wrapper that decides what the user sees
- solo front/back cover display should be handled by a pure viewport mask/crop layer outside the measured stage
- the flipbook stays mounted in the same coordinates every time

### 3. Stop remounting on every cosmetic effect change
Refactor `bookKey` so it only changes for structural changes:
- page count/order
- page roles
- geometry inputs

Do not remount the book for visual-only changes like:
- paper tint
- lamination sheen
- hole punch
- bleed inset styling

That prevents repeated full remeasurement during normal option tweaking.

### 4. Keep one printable-frame implementation
In `src/components/preview/PageEffects.tsx`:
- keep the absolute inset model for paper pages
- ensure margins are only rendered there, never in `FlipBook`
- material faces (PVC/card) must bypass paper-frame logic entirely

This makes page styling deterministic once the stage geometry is fixed.

### 5. Tighten the role model so materials never affect layout
Audit the current role handling:
- PVC/card roles should only affect content/effects
- they must never alter viewport math or page sizing logic
- blank simplex backs stay plain paper faces with the same paper-shell path

## Files to update
- `src/components/preview/FlipBook.tsx` — main root-cause fix
- `src/components/preview/PageEffects.tsx` — keep margin rendering single-source and layout-neutral
- `src/components/preview/previewTypes.ts` — only if needed to split structural vs visual dependencies
- `src/components/order/PreviewPanel.tsx` — only for minor structural metadata cleanup if required

## Expected result
- clear/matte/frosted front + card back no longer changes the visible paper margins
- white borders stay symmetric and stable
- bottom/right clipping disappears
- repeated option changes remain stable because the book is no longer measured in a moving/cropped state
- materials affect appearance only, not page geometry

## Technical note
The cleanest interpretation is:

```text
Current failure:
option change -> book remounts -> stage width/offset/crop also changes -> pageflip measures wrong box

Target:
option change -> book remounts only when structure changes -> measured stage stays fixed -> viewport presentation changes separately
```

So yes: there is still legacy layering in the current implementation, but the root cause is specifically in `FlipBook.tsx` geometry and remount behavior, not in the per-page bleed styling itself.
