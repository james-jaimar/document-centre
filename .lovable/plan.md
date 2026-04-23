

## Fix bound documents always opening as solo right-hand page

### Root cause

`showCover` in `react-pageflip` is set to `hasRealFrontCover`, which is only true when the first page role is `front_cover` or `pvc_cover_front`. When the user selects "No Cover", the first role is `body`, so `showCover` becomes `false` — react-pageflip then renders the opening view as a spread instead of a solo right-hand page.

The same conditional gates all solo-page detection in both `FlipBook.tsx` and `PreviewPanel.tsx`, breaking pagination labels and visible-page logic for no-cover documents.

### The fix

Every bound document physically opens with its first page on the right, whether that page is a cover or a body page. The `showCover` prop should always be `true` for bound documents. The cover/body distinction should only affect **labels**, not **layout**.

### Changes

**`src/components/preview/FlipBook.tsx`**

- Change `showCover={hasRealFrontCover}` to `showCover={true}` (it is only rendered for bound types already)
- Update solo-page detection to work for all bound documents regardless of cover presence:
  - `isShowingFrontCover` → rename to `isShowingFirstSolo` — true when `currentPage === 0` (always, for bound)
  - `isShowingLastSolo` — true when `currentPage >= lastIdx` (remove the `hasRealFrontCover` guard)
  - `isSoloPage` — true at first page or last page for all bound documents

**`src/components/order/PreviewPanel.tsx`**

- Mirror the same solo-state logic: the first page of a bound document is always a solo right-hand page
  - `isShowingFrontCover` → true when `isBound && currentPage === 0` (regardless of role)
  - `isShowingLastSolo` → true when `isBound && !hasBackCoverCard && currentPage >= totalPages - 1` (remove `hasRealFrontCover` guard)
  - `isSoloState` updated accordingly
- `visibleLeft` / `visibleRight` derivation stays the same — it already uses `isSoloState` correctly
- Label logic in `pageInfoText`: when `currentPage === 0`, use `hasRealFrontCover` to decide between "Front Cover" label vs the `faceLabel(0)` content-page label — structural layout is unaffected

### What stays untouched

- Ring binder code in `RingBinderOpenSpread.tsx` — completely isolated, not affected
- Tab overlay logic — uses `currentPage` which will now be correct
- All non-bound preview types (loose sheets, folds)

### Files to change

| File | Change |
|---|---|
| `src/components/preview/FlipBook.tsx` | `showCover={true}` always; remove `hasRealFrontCover` from solo-page structural guards |
| `src/components/order/PreviewPanel.tsx` | Remove `hasRealFrontCover` from solo-state structural guards; keep it only for label text |

### Result

- Wire-bound, comb-bound, saddle-stitched, and perfect-bound documents all open with the first page solo on the right — whether or not a cover is configured
- Pagination labels correctly show "Front Cover" when there is one, or "Page 1" when there is not
- Tab positions stay correct because the spread parity is restored
- Ring binder is not touched

