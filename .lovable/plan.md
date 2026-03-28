
Implement three focused fixes in the preview stack.

1. Correct the page model for bound previews
- Stop padding the page array with a fake trailing blank page just to satisfy cover mode.
- Build an explicit preview page sequence in `PreviewPanel.tsx`:
  - front cover = first real page
  - body pages = middle document pages + tabs/inserts
  - optional back cover card = appended extra page
- Track explicit page roles, including a dedicated solo-back state instead of relying on page count tricks.

2. Make FlipBook render true solo cover/back views
- In `FlipBook.tsx`, stop assuming every non-cover state is a two-page spread.
- Add logic based on `pageRoles` and current index so:
  - first page renders as a single right-hand page
  - last back cover card renders as a single left-hand page
  - no ghost/blank opposite page is shown in either case
- Update displayed page numbers and navigation math so the final state does not show “double blank” behavior.
- If `react-pageflip` cannot fully suppress the empty opposite side, wrap it with a layout mask/overlay so the unused half is visually hidden.

3. Fix the binding spine sizing/alignment regression
- In `FlipBook.tsx` and `BindingSpine.tsx`, align the spine to the actual rendered book height, not the outer wrapper/shadow box.
- Check the recent page border/shadow/container sizing changes and remove any clipping or height mismatch causing the spine image to stop short at the bottom.
- Ensure open/closed spine assets still stay centered and stretch full top-to-bottom.

Files to update
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/BindingSpine.tsx`
- `src/components/preview/previewTypes.ts` if a clearer page-role/page-mode type is needed

Technical notes
- The current bug is coming from using an even-page padding strategy plus generic spread math:
```text
front cover should be: [empty][page 1]
middle spreads should be: [left][right]
back cover card should be: [back cover][empty]
```
- Right now the data model creates extra blank states and the renderer treats them like normal spreads.
- The fix is to model/display solo states explicitly rather than faking them with padded pages.
