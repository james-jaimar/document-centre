

## Compact the Order Detail UI

### Problem
The Job Detail panel and Invoices list are too large and spread out. The reference system displays job info in a much tighter, denser layout. Two areas need attention:

1. **Invoices list** -- each row is too tall with text wrapping; the Send/View/PDF buttons take too much space
2. **Job Detail panel** -- excessive padding, large font sizes, and too much vertical spacing between sections

### Changes

**`src/components/orders/detail/JobDetailPanel.tsx`** -- Tighten the entire panel:
- Reduce outer `space-y-4` to `space-y-2`
- Reduce card padding from `p-4` to `p-3`
- Shrink Job ID from `text-lg` to `text-sm`
- Reduce quantity font from `text-lg font-bold` to `text-base font-semibold`
- Merge the Job header card and Job Info card into a single card to eliminate the gap between them
- Reduce grid `gap-y-2` to `gap-y-1` throughout
- Reduce section separator margins from `my-2` to `my-1`
- Make the preview button more compact (smaller padding)
- Status badges row: tighter `gap-2` instead of `gap-3`, rendered inline with the header rather than in a separate block
- Attached files section: reduce padding from `p-4` to `p-3`

**`src/components/orders/OrderInvoicesList.tsx`** -- Make rows more compact:
- Reduce row padding from `py-2.5` to `py-1.5`
- Use icon-only buttons (remove text labels "Send", "View", "PDF") with tooltips
- Shrink button icon size to `h-3 w-3`

### Result
A denser, more professional layout matching the reference system's clean presentation. No data is removed -- everything is still visible, just tighter.

### Files changed

| File | Change |
|------|--------|
| `src/components/orders/detail/JobDetailPanel.tsx` | Merge cards, reduce padding/spacing/font sizes throughout |
| `src/components/orders/OrderInvoicesList.tsx` | Icon-only action buttons, tighter row padding |

