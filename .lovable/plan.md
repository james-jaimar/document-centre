

## Fix: Remove duplicate footer numbering in FlipBook

### Problem
There are TWO footer numbering systems fighting each other:
1. **FlipBook footer** (lines 542-555 of FlipBook.tsx) — renders `faceLabels` below each spread side
2. **PreviewPanel footer** (line 607 of PreviewPanel.tsx) — renders `pageInfoText` with the correct content-only numbering

The FlipBook footer is showing raw numbers for tabs/inserts (e.g. "9", "12") instead of labels. Meanwhile, the PreviewPanel footer already produces the correct combined display like "Page 8 – Tab Divider (20 pages)".

### Fix

**`src/components/preview/FlipBook.tsx`** — Remove the FlipBook's own page number footer entirely (lines 542-555). The PreviewPanel footer already handles this correctly with the `pageInfoText` that shows content-only page numbers, friendly role names for tabs/inserts, and total page count. Having two footers causes confusion and the FlipBook one is the buggy one.

This is a simple deletion — remove the `<div>` block that renders `faceLabels` below the spread. The PreviewPanel's footer (Page info + slider + nav buttons) remains as the single source of truth.

### Result
- One consistent footer showing correct info: "Page 4 – Page 5 (20 pages)" for body spreads, "Page 8 – Tab Divider (20 pages)" for mixed spreads
- No more confusing duplicate numbers
- Tab/insert page numbering matches the drawer exactly

