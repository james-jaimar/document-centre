
Do I know what the issue is? Yes.

## What the actual problem is

This is not one bug. It is three connected design problems:

1. **The app is storing placement at section level, not page level**
   - In `src/components/order/TabInsertDrawer.tsx`, selecting “After Page 5” is converted to `parentSortOrder + 1`.
   - If the whole document body is one section, then pages 1–25 all belong to the same `sort_order`.
   - So page 5, page 12, and page 25 all save to the same value.
   - That is why the dropdown keeps snapping back to **“After Page 25”**.

2. **The preview engine can only inject tabs/inserts between sections, not inside a multi-page document section**
   - `src/components/order/PreviewPanel.tsx` currently flattens whole sections in order.
   - So even if the UI says “after page 5”, the preview cannot place a tab/insert there unless the body was already split into separate sections page-by-page.
   - That is why inserts/tabs are not appearing where the user chose.

3. **Tabs are likely being clipped even when they do render**
   - In `src/components/preview/FlipBook.tsx`, each page root has `overflow: hidden`.
   - The tab protrusion is rendered outside the page edge with `right: -12`.
   - So the protruding tab gets cut off before the user can see it.
   - This is why the Mimeo-style tab edge is not visible.

I also checked the DB state: the recent tabs/inserts are all being saved with the same `sort_order = 2`, which confirms the root problem.

## Clean fix

### 1. Change placement to a real page anchor
Use `document_sections.page_range_start` as the anchor meaning:

```text
page_range_start = insert/tab goes after physical body page N
```

This field already exists, so no schema change is needed.

Implementation:
- `src/hooks/useOrderBuilder.ts`
  - allow `useAddSection` to insert `page_range_start`
- `src/pages/dashboard/OrderBuild.tsx`
  - when adding/moving a tab or insert, save `page_range_start`
  - stop using `sort_order` as the actual page placement source
- `src/components/order/TabInsertDrawer.tsx`
  - read/write page anchors from `page_range_start`
  - use `sort_order` only as a fallback / stable secondary ordering

### 2. Rebuild the drawer interaction so there is only one source of truth
Right now the drawer has:
- an existing row with an “After Page X” dropdown
- plus a separate “Add tab after...” / “Insert after...” list below

That is the duplication the user is complaining about.

Replace it with a cleaner Mimeo-style flow:
- Tabs section:
  - list existing tabs
  - each row has:
    - label
    - after-page dropdown
    - delete
  - one clear **Add Tab** button
  - optional **Auto Insert** button
- Insert sheets section:
  - list existing inserts
  - each row has:
    - color swatch / color selector
    - after-page dropdown
    - delete
  - one clear **Add Insert Sheet** button

Result:
- no duplicated placement controls
- existing rows become the only editable controls
- much easier to manage multiple items

Files:
- `src/components/order/TabInsertDrawer.tsx`
- `src/pages/dashboard/OrderBuild.tsx`

### 3. Rebuild preview sequencing around body-page anchors
`PreviewPanel.tsx` needs to stop thinking in “section chunks only”.

New model:
1. Build the normal body page sequence from uploaded documents
2. Build an anchor map:
   - all tabs where `page_range_start = N`
   - all inserts where `page_range_start = N`
3. While generating physical preview pages, inject anchored items immediately after body page `N`
4. For inserts, generate two faces:
   - `insert`
   - `insert_back`

This makes “after page 5” mean exactly that, even when the uploaded file is one 25-page section.

File:
- `src/components/order/PreviewPanel.tsx`

### 4. Make tabs visually protrude like the reference
Fix the render layer so tabs can actually stick out:
- remove clipping from the page root in `FlipBook.tsx`
- keep clipping only on the inner paper/content frame
- add a small right-side preview gutter so the outermost tab is still visible
- render the tab label on the protruding tab edge, not just a number

Files:
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/PageEffects.tsx`

### 5. Preserve backward compatibility
For older tab/insert records that only have `sort_order`:
- derive a fallback anchor from current section placement
- once the user edits the item in the drawer, save `page_range_start` permanently

## Files to update

- `src/hooks/useOrderBuilder.ts`
- `src/pages/dashboard/OrderBuild.tsx`
- `src/components/order/TabInsertDrawer.tsx`
- `src/components/order/PreviewPanel.tsx`
- `src/components/preview/FlipBook.tsx`
- `src/components/preview/PageEffects.tsx`

## Expected result

- Selecting **After Page 5** stays on page 5
- Tabs and inserts no longer collapse to **After Page 25**
- The drawer has one clean control model, not duplicated add/edit placement
- Insert sheets appear as true physical two-sided sheets after the selected page
- Tabs visibly protrude from the document edge like the Mimeo reference
- Reopening the drawer shows the saved placement correctly every time
