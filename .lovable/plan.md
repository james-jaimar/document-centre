

# Right-Drawer Tab & Insert Manager + Physical Sheet Preview

## Problems identified

1. **"Selects every page" bug**: `bodyPages` in both managers assigns every page within a multi-page section the same `sortOrder` (the section's `sort_order`). When used as `SelectItem` values, all pages from the same section share the same value, so selecting one selects all. Additionally, insert/tab sections with no document fall through to `doc?.page_count ?? 1`, adding ghost entries to the page list.

2. **Only one item visible**: The tiny popover and cramped inline UI makes it nearly impossible to manage multiple tabs/inserts. The user wants a proper right-side drawer.

3. **No preview rendering**: Tabs and inserts are being created in the DB correctly (the screenshot shows them), but the preview isn't updating because the `structuralKey` in FlipBook doesn't include `pageLabels`/`pageColors`, so adding a tab/insert doesn't trigger a remount. Also, the `PreviewPanel` role assignment marks tabs as `"body"` (line 140) instead of `"tab"`, so they never get tab rendering treatment.

4. **Insert sheets need two faces**: User confirmed they want physical sheets — each insert should produce 2 pages in the sequence (front + back) like simplex blank backs.

## Plan

### 1. Fix the page-position model (shared fix for both managers)

Replace the per-page `sortOrder` model with a unique per-page index. Instead of using `section.sort_order` as the `SelectItem` value (which duplicates), use sequential page numbers as values. The callback then calculates the correct `sort_order` to place the tab/insert after that page's parent section.

**Changes to both `TabManager.tsx` and `InsertManager.tsx`:**
- `bodyPages` entries get a unique `pageNumber` (1, 2, 3...) used as the Select value
- A mapping function converts page number → correct section sort_order for the DB insert
- Fix: skip insert/tab sections when building `bodyPages` (already done, but also skip sections with no document that aren't body type)

### 2. New right-drawer UI for managing tabs and inserts

Create `src/components/order/TabInsertDrawer.tsx`:
- Uses shadcn `Sheet` component (side="right", ~400px wide)
- Two sections: "Tab Dividers" and "Insert Sheets", each with:
  - Header with count and Add button
  - List of existing items with: color swatch, editable label (tabs), "After Page X" dropdown, delete button
  - For tabs: Auto-Insert button
  - For inserts: Color picker (5 swatches) before page selection
- Triggered by a button in `OrderBuild.tsx` sidebar (replaces inline managers)
- The drawer stays open while the user configures, preview updates live behind it

**Changes to `OrderBuild.tsx`:**
- Remove inline `TabManager` and `InsertManager` renders
- Add a "Manage Tabs & Inserts" button that opens the drawer
- Show the button only when tabs or inserts are enabled
- Pass all the same callbacks to the drawer

### 3. Fix PreviewPanel role assignment for tabs

**Changes to `PreviewPanel.tsx` line 140:**
- Change `if (p.section?.section_type === "tab") return "body"` → `return "tab"`

### 4. Make inserts render as physical two-sided sheets

**Changes to `PreviewPanel.tsx`:**
- After pushing the insert page, push a second page with role `"insert_back"` (blank reverse side)
- This makes inserts physical sheets in the flipbook

**Changes to `FlipBook.tsx`:**
- Add `"insert_back"` to `CONTENT_LESS_ROLES`

**Changes to `PageEffects.tsx`:**
- Add `"insert_back"` branch that renders as plain paper (same color as front, no watermark)

### 5. Fix structuralKey to include labels/colors

**Changes to `FlipBook.tsx`:**
- Add `pageLabels` and `pageColors` to the `structuralKey` JSON so adding/moving tabs and inserts triggers a proper remount

## Files to create/edit

- **New**: `src/components/order/TabInsertDrawer.tsx` — right-side Sheet with full tab + insert management UI
- **Edit**: `src/pages/dashboard/OrderBuild.tsx` — replace inline managers with drawer trigger button
- **Edit**: `src/components/order/PreviewPanel.tsx` — fix tab role, add insert back face
- **Edit**: `src/components/preview/FlipBook.tsx` — add insert_back to content-less roles, fix structuralKey
- **Edit**: `src/components/preview/PageEffects.tsx` — add insert_back rendering branch

## Expected result

- "Manage Tabs & Inserts" button opens a spacious right drawer
- Each page has a unique value in the dropdown — no more "selects every page"
- Adding a tab immediately shows it in the flipbook with protruding colored extension
- Adding an insert shows a two-sided colored sheet in the flipbook
- Labels entered on tabs display on the tab page in the preview

