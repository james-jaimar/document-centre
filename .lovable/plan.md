

# Tab Dividers & Insert Sheets — Full UI/UX Implementation

## Current state
- **TabManager** exists but only appears on OrderFiles page, and only when a "tab" product option is selected in the spec. On the OrderBuild page (where users configure), there is zero tab/insert UI.
- **Insert sheets** can only be added via SectionActions which requires a file to be selected — but inserts are document-less. So users can never create them.
- **FlipBook rendering** for tabs/inserts already exists (content-less pages), but no sections are ever created so nothing shows.
- The `document_sections` table has no `label` column for tab text or `color` column for insert sheet color.

## Plan

### 1. Database: add label + color columns to document_sections
Create a migration adding:
- `label TEXT` — optional text for tab labels (e.g. "Section 1", "Appendix")
- `color TEXT` — optional color value for insert sheets (e.g. "white", "yellow", "#e0e7ff")

Regenerate Supabase types after.

### 2. New component: InsertManager (mirrors TabManager pattern)
Create `src/components/order/InsertManager.tsx`:
- Shows list of existing insert sections with their position ("After Page X") and color
- "Add Insert" button opens a popover: pick "After which page?" + pick a color (white, yellow, blue, green, pink)
- Delete button per insert
- "Auto-Insert" not needed for inserts (manual only)

### 3. Enhance TabManager with label editing
Update `src/components/order/TabManager.tsx`:
- Add an inline text input per tab for the label (like Mimeo's editable tab text)
- Save label via `onUpdateTab` callback that calls `useUpdateSection`
- Keep existing "After Page X" dropdown and Auto-Insert

### 4. Wire both managers into OrderBuild page
Update `src/pages/dashboard/OrderBuild.tsx`:
- Import TabManager + InsertManager
- Add them below the OptionsPanel in the left column (inside a collapsible section)
- Derive `tabInfo` the same way OrderFiles does (from product options metadata)
- Wire up `onAddTab`, `onDeleteTab`, `onMoveTab`, `onAddInsert`, `onDeleteInsert` using existing hooks

### 5. Fix SectionActions for document-less inserts/tabs
Update `src/components/order/SectionActions.tsx`:
- Remove "Insert" and "Tab Divider" from the file-based actions list (they don't need a file)
- Or: make them work without a selected file by immediately creating a document-less section

### 6. Update FlipBook rendering for labels + colors
- `FlipBook.tsx`: Pass `label` and `color` from section data to FlipPage
- `PageEffects.tsx`: Render tab labels on tab pages; use section color for insert pages instead of the hardcoded color map

### 7. Update PreviewPanel to pass section metadata
- Pass `label` and `color` through the page sequence so FlipBook can render them

## Files to create/edit
- **New migration**: `supabase/migrations/XXXX_add_section_label_color.sql`
- **New file**: `src/components/order/InsertManager.tsx`
- **Edit**: `src/components/order/TabManager.tsx` — add label input
- **Edit**: `src/pages/dashboard/OrderBuild.tsx` — wire in both managers
- **Edit**: `src/components/order/SectionActions.tsx` — remove insert/tab from file-dependent actions
- **Edit**: `src/components/preview/FlipBook.tsx` — render labels + colors
- **Edit**: `src/components/preview/PageEffects.tsx` — use dynamic color/label
- **Edit**: `src/components/order/PreviewPanel.tsx` — pass label/color through page sequence
- **Regenerate**: `src/integrations/supabase/types.ts`

## Expected result
- Users see a "Manage Tabs" section on the OrderBuild page with per-tab label editing and "After Page X" positioning
- Users see an "Insert Sheets" section with add/delete and color picker
- Tabs render in the flipbook with their label text visible
- Insert sheets render as solid colored pages
- Everything works like the Mimeo reference screenshot

