

## Fix: Align page numbering between preview and Tab/Insert drawer

### Problem
The preview numbers every physical face sequentially (tabs, blank backs, inserts all get numbers), while the Tab & Insert drawer only counts body document pages. So "After Page 6" in the drawer might be "Page 14" in the preview. Users can't tell where to place tabs/inserts.

### Root Cause
`displayPageNumbers` in `PreviewPanel.tsx` does a simple `num++` for every face in `finalPages`, including tab faces, insert faces, blank backs, and cover material pages. The drawer's `buildBodyPages` correctly counts only body document pages, but those numbers don't match what the user sees in the preview.

### Fix
One file change: `src/components/order/PreviewPanel.tsx`

Update `displayPageNumbers` computation to only increment the counter for actual body content faces (not tabs, tab backs, inserts, insert backs, blank backs, cover material faces). Non-content faces get `null`/`0` so the footer skips showing a number for them.

Specifically:
- Check `computedPageRoles[i]` for each face
- Only increment the page counter for roles that represent actual printed content pages (body pages, front/back cover content)
- Tab, tab_back, insert, insert_back, blank_back, pvc_cover_back, inside_back_cover_card, back_cover_card, inside_back_blank → get `null` (no number displayed)
- Update the footer label logic to handle `null` entries gracefully — when on a non-numbered face, show the role name (e.g. "Tab Divider", "Insert Sheet") instead of "Page X"

This means the preview will show "Page 6" on the same body page that the drawer calls "After Page 6" — they use the same counting logic (body pages only).

### What stays the same
- The drawer's `buildBodyPages` numbering — it's already correct
- The physical sequence and spread alignment logic
- Tab/insert placement anchoring (uses `page_range_start` which stores body page numbers)

