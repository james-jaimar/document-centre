

# Responsive Options Panel + Tab/Insert Placement UI + Preview Rendering

## Three deliverables

### 1. Compact options panel on smaller screens
The left column in `OrderBuild.tsx` is fixed at `340px` (`lg:grid-cols-[340px_1fr]`). On laptop screens (1280-1440px), this eats too much space.

**Changes to `OrderBuild.tsx`:**
- Reduce the left column from `340px` to `300px` at `lg`, and use `xl:grid-cols-[340px_1fr]` for larger screens
- Reduce inner padding from `p-4` to `p-3` in the options column
- Make the accordion triggers and option selectors more compact (smaller text, tighter spacing)

**Changes to `OptionsPanel.tsx`:**
- Reduce trigger padding from `py-3` to `py-2`
- Reduce content padding from `pb-3` to `pb-2`

### 2. Tab divider placement UI with "insert after page X" control
The `TabManager` component exists and is wired up in `OrderFiles.tsx`, but tabs currently just get appended at the end with no page-position control. Users need to specify where each tab goes.

**Changes to `TabManager.tsx`:**
- Replace the current "Position {sort_order}" display with a dropdown: "Insert after Page X" using the existing `bodyPages` array (already computed but unused)
- When a user picks a page from the dropdown, call `onMoveTab` to update the tab's sort_order to sit after that section
- For "Add Tab" button, show a small popover or inline dropdown asking "After which page?" before inserting
- Keep Auto-Insert as-is (it already distributes evenly)

### 3. Insert sheets (blank/colored dividers) — placement UI + preview rendering
Inserts use `section_type: "insert"` and work similarly to tabs. They need:

**Changes to `SectionActions.tsx`:**
- The "Insert" action already exists — no change needed

**Changes to `SectionList.tsx`:**
- For insert sections (which have no document), show a colored divider indicator instead of a missing-thumbnail icon
- Add a "Position: after Page X" label similar to tabs

**Changes to `PreviewPanel.tsx` (page sequence building):**
- Insert sections currently get processed like regular doc sections but have no document — they need special handling like tabs
- Add insert sections as blank colored pages in the sequence with a role of `"insert"`

**Changes to `FlipBook.tsx` (rendering):**
- Add `"insert"` to the content-less roles or render it as a colored card sheet
- Render inserts as solid colored divider pages (similar to tab rendering but full-page, no protruding tab extension)

**Changes to `PageEffects.tsx`:**
- Add an `"insert"` role branch that renders as a solid colored sheet (white, or a configurable color)

## Files to edit
- `src/pages/dashboard/OrderBuild.tsx` — responsive grid column sizing
- `src/components/order/OptionsPanel.tsx` — tighter accordion spacing
- `src/components/order/TabManager.tsx` — "insert after page X" dropdown per tab
- `src/components/order/PreviewPanel.tsx` — handle insert sections in page sequence
- `src/components/preview/FlipBook.tsx` — render insert pages
- `src/components/preview/PageEffects.tsx` — insert role visual treatment

