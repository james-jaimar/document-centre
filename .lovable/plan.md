

## Upgrade Invoice PDF to Professional Layout

### What changes

The `generate-invoice-pdf` edge function will be rewritten with a polished, professional layout inspired by the reference project's clean design. The PDF generation stays server-side using `pdf-lib` (no library change needed -- the issue is layout and typography, not tooling).

### Design improvements

**Header band**
- Increase height to 70pt with better vertical centering
- Logo or company name centered vertically within the band
- Document title (TAX INVOICE / PROFORMA) right-aligned with larger, bolder type
- Subtle bottom shadow effect via a thin gradient-like strip below the band

**Company info + invoice meta**
- Two-column layout with clear visual separation
- Left: company address block with slightly larger company name (bold, 11pt) and details below (9pt)
- Right: invoice meta in a neat bordered box with alternating light background rows (Invoice No, Order No, Date, Currency)

**Bill To / Ship To**
- Section headers with a small colored accent bar (4pt wide, using primary color) to the left of the label
- Cleaner spacing between address lines (13pt line height)
- Light gray background card behind each address block

**Items table**
- Dark header row using tenant's primary color with white text
- Alternating row backgrounds (white / very light gray)
- Thin horizontal separators between rows
- Better column alignment: Description (left, wide), Qty (center, narrow), Unit Price (right), Total (right)
- Spec chips rendered on a second line in italic, slightly indented
- Proper page-break handling: repeat table header on new pages

**Totals section**
- Right-aligned summary box with a subtle border
- Clear visual hierarchy: regular items in 9pt, Total and Amount Due in 11pt bold with a top rule
- Skip zero-value lines (e.g. no discount line if discount is 0)

**Banking details**
- Centered section with a light background fill and rounded-corner effect (simulated with filled rectangle)
- "BANKING DETAILS" header centered and bold
- Details in a clean centered layout below

**Footer**
- Thin horizontal rule across page width
- Footer text centered in 8pt gray
- Page number bottom-right if multi-page

**Typography**
- Continue using Helvetica/HelveticaBold (universally available in pdf-lib)
- Better size hierarchy: 18pt header name, 14pt doc title, 11pt section headers, 10pt body, 9pt details, 8pt footer
- Consistent color: dark navy (#1a1a2e) for body text, medium gray for secondary text

### Technical approach

The entire `buildPdf` function will be rewritten with:
- A `drawPage` helper that tracks current page and handles page breaks with header repetition
- Proper Y-position tracking with configurable line heights and section spacing
- A `drawTableRow` helper for consistent item rendering with alternating backgrounds
- A `drawTotalsBox` that draws a bordered summary aligned to the right margin

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/generate-invoice-pdf/index.ts` | Rewrite `buildPdf` function with professional layout, better spacing, colored table headers, alternating rows, accent bars, totals box, and proper multi-page support |

No new dependencies, no database changes, no client-side changes needed. The function will be redeployed after the update.

