
## Fix the tab/insert preview by enforcing a right-page start in the flipbook

### What is actually wrong
The sequence builder in `src/components/order/PreviewPanel.tsx` is already close to the correct physical model:

- body page
- reverse face of that sheet
- then tab/insert front
- then tab/insert back

The real break is in `src/components/preview/FlipBook.tsx`:
- `react-pageflip` is mounted with `showCover={true}`
- that makes the first page a special solo cover page
- but the rest of the code is still treating `currentPage` and `currentPage + 1` as a normal left/right spread model

That mismatch is why tabs/inserts are being displayed as if they begin across a left/right spread instead of always beginning on the right-hand face of a new sheet.

### Implementation approach

#### 1. Make the flipbook use a single consistent physical spread model
In `src/components/preview/FlipBook.tsx`:
- remove the special cover-mode assumption from the bound viewer
- stop relying on `showCover={true}` for normal page positioning
- use a consistent spread model where each physical face index maps predictably to left/right placement

Goal:
- a tab front or insert front must always render on the right page
- its back must always render on the following left page

#### 2. Drive visible spread state from physical face parity, not ad hoc cover logic
Still in `FlipBook.tsx`:
- replace current `isShowingFrontCover`, `isSoloPage`, and visible-number assumptions with explicit left/right physical face calculation
- define the active spread from the physical face sequence itself:
  - right-starting sheet front
  - following left-side back
- ensure navigation advances by full spreads without making a tab/insert appear to “start left”

#### 3. Align preview labels with the actual visible faces
In `src/components/order/PreviewPanel.tsx`:
- stop assuming `currentPage` is always the left visible page for bound products
- compute the displayed page info from the actual spread model used by `FlipBook`
- keep `displayPageNumbers`, but use it only as labels for already-correct physical faces

#### 4. Keep the sequence builder simple
In `src/components/order/PreviewPanel.tsx`:
- keep tabs/inserts as two physical faces:
  - `tab` + `tab_back`
  - `insert` + `insert_back`
- keep the “finish current sheet, then insert” rule
- do not add any more post-processing or blank-page patch logic

#### 5. Preserve tab overlay positioning after the spread-model fix
In `src/components/preview/FlipBook.tsx`:
- update `TabOverlay`’s ahead/behind/current logic so it uses the corrected visible spread boundaries
- tabs ahead of the current spread stay on the right edge
- tabs behind stay on the left edge
- no tab should appear as the visible left start of a newly inserted sheet

## Files to update
- `src/components/preview/FlipBook.tsx`
- `src/components/order/PreviewPanel.tsx`

## Expected result
If a tab or insert is placed after page 6:
- page 6 remains the right/front of its sheet
- page 7 is the left/back of that same sheet
- tab/insert front begins on the next right-hand page
- tab/insert back is on the following left-hand page

So in practical terms:
- tabs never begin on a left page
- inserts never begin on a left page
- no divider sheet is visually split across an impossible spread

## Technical note
This should be treated as a viewer/spread-mapping bug, not another sequence-building rewrite. The physical page list is mostly correct; the bound preview is interpreting and presenting it with the wrong left/right model.
