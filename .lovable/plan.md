

# Fix Tab Dividers & Insert Sheets UI Visibility

## What's happening

The code is correct structurally — `TabManager` renders when a tab option with `tab_count > 0` is selected, and `InsertManager` always renders. But there are two problems:

1. **InsertManager shows unconditionally** — it should only appear when an insert option other than "No Inserts" is selected (like how TabManager only appears when tabs are selected). Currently it just sits there saying "No insert sheets added yet" even when the user has "No Inserts" selected.

2. **Both managers are buried below the options accordion** — when tabs or inserts are selected, the management UI appears below the last accordion item. On a laptop screen, this is likely below the visible fold inside the scrollable options column. There's no visual signal that new UI appeared.

3. **The `multi_color` metadata key doesn't match** — the DB stores `"color": "multi"` but the code checks `metadata?.multi_color`. Minor but worth fixing.

## The fix

### Make InsertManager conditional (like TabManager)
In `OrderBuild.tsx`, derive `insertInfo` from the Inserts option — check if the selected slug is not "no-inserts". Only render `InsertManager` when inserts are enabled.

### Make both managers more prominent
- When TabManager or InsertManager appear, render them as highlighted sections (with a subtle accent border or background) so they're visually distinct from the options accordion
- Auto-scroll the options panel to show the newly-appeared manager when a tab/insert option is selected

### Fix multi_color detection
Check `metadata?.color === "multi"` instead of `metadata?.multi_color`.

## Files to edit

- `src/pages/dashboard/OrderBuild.tsx` — add `insertInfo` conditional logic (mirror `tabInfo` pattern), fix `multiColor` detection, add scroll-into-view behavior
- No other files need changes

## Expected result
- Selecting "5-Tab Dividers (White)" from the dropdown immediately shows the TabManager panel below the options, scrolled into view
- Selecting "Blank Coloured Divider Sheets" from the Inserts dropdown shows the InsertManager panel
- Selecting "No Tab Dividers" or "No Inserts" hides the respective manager
- Multi-colour tabs are correctly detected

