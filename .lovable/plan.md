

## Fix four ring binder preview bugs

### Issues

1. **Initial view blank**: Virtual `pvc_cover_front`/`pvc_cover_back` pages are injected even when "No Cover" is selected, creating blank filler pages at the start
2. **Edge-to-edge not applicable**: Ring binder pages sit in a mechanism — bleed/edge-to-edge should never apply to body pages (white margin should always show)
3. **Simplex missing blank backs**: `buildPageSequence` explicitly skips `blank_back` injection for ring binders (line 177), so simplex pages display as if duplex — both sides show content
4. **Tabs spanning the spread**: Without blank backs, tab faces land on arbitrary positions; a tab front can end up on the left page and its back on the right, which is physically impossible

### Root cause

Issues 3 and 4 stem from one line: the ring binder exception at `PreviewPanel.tsx:177` that skips blank-back injection. This was added when the ring binder was first built as a single-page stepper, but it breaks physical sheet modelling. Fixing blank-back injection also fixes tab alignment (tabs always start on right-hand/even indices via the existing parity flush logic).

### Changes

#### 1. `src/components/order/PreviewPanel.tsx`

**Remove ring binder blank-back skip** (line 177):
Change `if (!section.is_duplex && !forceDuplex && productType !== "ring_binder")` to `if (!section.is_duplex && !forceDuplex)` — ring binders now get proper simplex blank backs like every other bound type.

**Fix pagination step** (line 218):
Change `const step = isBound && !isRingBinder ? 2 : 1` to `const step = isBound ? 2 : 1` — ring binder now steps by 2 (spread pairs), matching its two-page spread renderer.

**Remove ring binder cover injection when no cover selected** (lines 368-375):
Only inject the virtual cover pair when a cover option (PVC or card) is actually selected. When the user picks "No Cover", skip injection entirely — let the ring binder component show the first body page through the clear binder window on page 0.

**Fix bleed flags for ring binder**: Add a guard so ring binder body pages never get bleed=true. Ring binder pages sit inside a mechanism and should always show the white inset margin. Only PVC/card cover materials should get full bleed.

#### 2. `src/lib/orders/buildPreviewSnapshot.ts`

Mirror all PreviewPanel changes for placed-order previews:
- Remove `productType !== "ring_binder"` blank-back skip (same logic)
- Conditionally inject virtual cover pair (only when cover option is chosen)
- Add ring binder body bleed suppression

#### 3. `src/components/preview/RingBinderOpenSpread.tsx`

**Fix spread indexing**: Currently `rightIndex = currentPage`, `leftIndex = currentPage - 1`. With proper spread parity (even=right, odd pairs), update to standard spread indexing: left = currentPage, right = currentPage + 1 (matching how FlipBook pairs work with `showCover={true}`).

**Fix tab overlay positioning**: The `RingTabOverlay` visibility check (`tab.pageIndex >= currentPage`) needs to account for the spread — tabs on the current RIGHT page should show, tabs behind the left page should not. Update to `tab.pageIndex >= rightIndex`.

**Closed cover view (page 0)**: When no cover is injected, use the first body page thumbnail in the binder window. When the virtual cover exists, keep existing behaviour.

### Files to change

| File | Change |
|---|---|
| `src/components/order/PreviewPanel.tsx` | Remove ring binder blank-back skip, fix step to 2, conditional cover injection, bleed suppression |
| `src/lib/orders/buildPreviewSnapshot.ts` | Mirror all above for placed-order previews |
| `src/components/preview/RingBinderOpenSpread.tsx` | Fix spread indexing, tab overlay visibility, closed-cover fallback |

### Result

- Simplex ring binder pages show content on front, blank on back (physically correct)
- Tabs always appear on the right-hand side only, never split across a spread
- "No Cover" means no blank filler pages — first body page shows through the binder window
- Ring binder body pages always render with white inset margin (no edge-to-edge)
- Pagination steps by 2 (spread pairs) matching the two-page layout

