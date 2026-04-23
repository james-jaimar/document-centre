

## Fix insert sheet positioning for single-sided documents

### Problem

In `InsertManager.tsx`, the `bodyPages` array gives every page within a document section the **same `sortOrder`** (the section's `sort_order` value). When a single 8-page document is uploaded as one section, all 8 pages share the same sort order. The dropdown deduplicates or skips entries, resulting in only even-numbered pages appearing as insert targets.

### Root cause (line 53)

```ts
pages.push({ label: `Page ${pageNum}`, sortOrder: section.sort_order });
```

Every page `p` in the loop gets `section.sort_order` regardless of which page within the document it is.

### Fix

Generate a unique fractional sort order per page within each section so every page becomes a distinct insert target:

```ts
pages.push({
  label: `Page ${pageNum}`,
  sortOrder: section.sort_order + (p / count),
});
```

This gives an 8-page section with `sort_order = 1` the values `1.000, 1.125, 1.250, 1.375, 1.500, 1.625, 1.750, 1.875` — each unique, each a valid insert-after target.

The `handleAddAfterPage` callback already does `sortOrder + 1`, and `getInsertPageLabel` compares with `<`, so fractional values work without any other changes.

### File to change

| File | Change |
|---|---|
| `src/components/order/InsertManager.tsx` | Line 53: use `section.sort_order + (p / count)` instead of `section.sort_order` |

### Result

- Single-sided 8-page document shows "After Page 1" through "After Page 8"
- Double-sided documents continue to work correctly
- No changes to any other component

