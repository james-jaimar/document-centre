

# Tab Dividers — Management UI + Preview Visualization

## What we're building

A tab divider management system that lets users insert tab dividers at specific page positions within their bound document. Tabs appear in the preview as pages with a visible tab extension protruding from the right edge, and users can specify where each tab goes (before/after a given page).

## Current state

- `"tab"` already exists as a `section_type` enum value in the database
- Tab divider options exist in the product configurator (5-tab, 10-tab, 12-tab, multi-colour, custom)
- `SectionActions` already has a "Tab Divider" button that creates a section with `section_type: "tab"`
- However, there's no dedicated UI for managing tab placement, no way to specify *where* a tab goes, and no visual representation of tabs in the FlipBook preview

## Design

### 1. Tab Management Panel (new component)

When the user selects a tab divider option (not "No Tab Dividers"), show a **Tab Manager** panel below the sections list on the OrderFiles page. This panel:

- Shows the selected tab count (e.g. "5-Tab Dividers")
- Lists each tab with its insertion point (page number) and position (before/after)
- Has an "Auto-Insert Tabs" button that evenly distributes tabs through the document
- Has an "Add Tab" button for manual placement
- Each tab row shows: tab number, "Insert before page [dropdown]", and a remove button
- Tabs are stored as `document_sections` with `section_type: "tab"` and `document_id: null` (they're blank sheets, not uploaded files). The `sort_order` determines where they appear in the page sequence.

### 2. Tab visualization in FlipBook preview

In `PreviewPanel`, when building the flat page list, tab sections (where `document_id` is null and `section_type === "tab"`) render as:

- A blank page (white or coloured card depending on the tab option's color metadata)
- A small rectangular **tab extension** protruding from the right edge, staggered vertically so each tab is at a different position (like real tab dividers)
- Tab label text on the extension (e.g. "Tab 1", "Tab 2")

This is done by passing a `sectionTypes` array alongside `colorFlags` to FlipBook, so `FlipPage` knows which pages are tabs and renders the tab extension.

### 3. Data model usage

No schema changes needed. Tab sections use existing `document_sections` with:
- `section_type: "tab"`
- `document_id: null` (no uploaded file — it's a blank divider)
- `sort_order` controls position in the page sequence
- `page_range_start` / `page_range_end` are unused (single page)

### Technical details

**Files to create:**
1. **`src/components/order/TabManager.tsx`** — Tab management panel with auto-insert, manual add, reorder, remove. Takes sections + documents and the selected tab option metadata (tab_count, color). Calls `useAddSection` / `useDeleteSection` to create/remove tab sections.

**Files to edit:**
2. **`src/pages/dashboard/OrderFiles.tsx`** — Import and render `TabManager` below `SectionList` when a tab divider option is active on the order item's spec
3. **`src/components/order/PreviewPanel.tsx`** — When building the `pages` array, include tab sections as blank pages. Pass a `sectionTypes` string array (e.g. `["body", "body", "tab", "body", ...]`) to `DocumentPreview`
4. **`src/components/preview/previewTypes.ts`** — Add `sectionTypes?: string[]` to `PreviewComponentProps` and `FlipBookProps`
5. **`src/components/preview/FlipBook.tsx`** — In `FlipPage`, when `sectionType === "tab"`, render a blank card page with a protruding tab rectangle on the right edge. The tab position is staggered based on tab index.
6. **`src/components/preview/DocumentPreview.tsx`** — Pass `sectionTypes` through

### Tab preview rendering (FlipPage)

When a page is a tab divider:
- Background: white card (or multi-colour based on tab index)
- A small rectangle extends ~15px beyond the right edge of the page, positioned at a vertical offset based on tab index (evenly spaced down the page height)
- The tab has a subtle border and rounded right corners
- Text "Tab N" in small font on the extension

For multi-colour tabs, cycle through: red, blue, green, yellow, orange for 5-tab sets.

### Auto-Insert logic

"Auto-Insert Tabs" distributes N tabs evenly through the body pages:
- Count total body pages
- Divide into N+1 equal segments
- Insert a tab section at each segment boundary
- Recalculate sort_orders for all sections

