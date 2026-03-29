
Fix the preview by making the rendered book state fully deterministic instead of partially derived from stale internal flipbook state.

## What I found

The instability is coming from a few things working against each other:

1. `react-pageflip` keeps its own internal page/DOM state after mount.
2. We force remounts with a `key`, but the key only includes:
   - `effects.bleed`
   - `pageRoles`
   - `urls.length`
3. Many visual changes do **not** change that key:
   - `effects.frontCover`
   - `effects.backCover`
   - `effects.paperColor`
   - `effects.coverLamination`
   - `effects.holePunch`
   - `colorFlags`
   - actual `urls` content/order
4. On remount, `FlipBook` immediately resets to page `0` and calls `onPageChange(0)`, which can fight the parent state while the user is changing options.
5. Solo/spread layout in `FlipBook.tsx` is still based on `displayPage`, which is a local mirror that can temporarily drift during re-init.

That combination explains the “looks right once, then bounces around / reverts / shows wrong borders later” behavior.

## Implementation plan

### 1. Make the book key cover every rendering-critical input
Update `FlipBook.tsx` so the remount key is based on the full visual/structural state, not just bleed:
- full `resolvedEffects`
- `pageRoles`
- `sectionTypes`
- `colorFlags`
- `urls` (or a stable summary of them)

This ensures any option change creates a fresh, correct flipbook instance.

### 2. Stop forcing parent page state back to 0 during remount
Remove the effect that does:
- `setDisplayPage(0)`
- `lastReportedPage.current = 0`
- `onPageChange(0)`

Instead:
- treat remount as a visual refresh only
- preserve the parent’s selected page when possible
- only sync page state from actual flipbook events (`onInit` / `onFlip`) or controlled navigation effect

This should eliminate the “jumping” and session inconsistency.

### 3. Use the controlled page as the source of truth for layout
Refactor solo/spread detection in `FlipBook.tsx` to derive layout from `currentPage`, not a potentially stale local `displayPage`.

Use explicit role logic:
- front solo when `currentPage === 0`
- back solo when current page is the real final solo page
- spread otherwise

Keep local state only if needed for library event sync, not for deciding margins/spine/viewport cropping.

### 4. Sync with the library using init/update events instead of implicit reset logic
Use the flipbook lifecycle more cleanly:
- on init, align local display state to the real current page
- on flip, update parent
- in the controlled-page effect, move the library only when its current page differs

This removes the current “reset then animate back” feel.

### 5. Stabilize back-cover rendering as role-driven, not history-driven
Keep `back_cover_card` fully deterministic:
- no border
- no inset shadow
- no bleed padding
- full solid fill

Also ensure `inside_back_blank` stays separate from `back_cover_card` so the renderer never reuses styling from a prior page state.

### 6. Audit the parent sequence flow once
In `PreviewPanel.tsx`, verify the final physical page sequence remains stable while options change:
- `front_cover`
- body pages
- optional `inside_back_blank`
- optional `back_cover_card`

The important part is that cover option changes should only change the final sequence when physically necessary, not cause unrelated preview resets.

## Files to update

- `src/components/preview/FlipBook.tsx`
- `src/components/order/PreviewPanel.tsx` (light audit, likely minimal)
- possibly `src/components/preview/PageEffects.tsx` only if any stale styling assumptions remain after the main cleanup

## Expected result

After this cleanup:
- changing options repeatedly does not cause bouncing or reversion
- whatever the customer selects stays visually consistent in that session
- back cover card always renders edge-to-edge when selected
- borders/margins no longer appear inconsistently after switching options
- front cover, spreads, and back cover remain stable under repeated changes
