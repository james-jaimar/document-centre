## Goal

Two improvements to the quote PDF (`supabase/functions/quote-pdf/index.ts`):

1. Embed the typeface so the PDF renders identically on any viewer (currently uses the base-14 `Helvetica`, which is not embedded — Acrobat falls back to a system font when missing).
2. Render a real, itemised configuration breakdown for each line — so admins can see paper stock, binding, covers, lamination, sides, page count, etc. — instead of just "Bound Documents".

---

### 1. Embed the font

**Problem:** `pdf.embedFont(StandardFonts.Helvetica)` uses one of pdf‑lib's 14 standard fonts. These are *never* embedded; the document just references them by name. Your screenshot confirms this — "Helvetica" listed as Type 1, not embedded.

**Fix:** embed a real TrueType font and subset it (so file size stays tiny — only used glyphs ship).

- Register `@pdf-lib/fontkit` on the document so subsetted TTF embedding works:
  ```ts
  import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
  pdf.registerFontkit(fontkit);
  ```
- Fetch two TTF files (regular + bold) on first invocation and cache the bytes in module-level `Uint8Array` variables (so warm invocations don't re-download). Use a metric-compatible, freely-licensed sans-serif so the layout doesn't shift. Recommended: **Liberation Sans** (Helvetica metrics) or **Noto Sans** (very wide glyph coverage, including the ZAR "R" and any diacritics in customer names). I suggest **Noto Sans Regular + Bold** from the jsDelivr Google Fonts mirror, e.g. `https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.0.22/files/noto-sans-latin-400-normal.ttf` and the matching `700` file.
- Replace the two `embedFont(StandardFonts.…)` calls with `pdf.embedFont(regularBytes, { subset: true })` and the bold equivalent. All existing `font` / `bold` references and `widthOfTextAtSize` calls keep working unchanged.
- Fall back to `StandardFonts.Helvetica` only if the fetch fails, so a CDN outage doesn't break PDF generation.

Result: Acrobat's *Fonts* tab will list `NotoSans` (Embedded Subset) / `NotoSans-Bold` (Embedded Subset), and the PDF renders identically everywhere.

---

### 2. Real line-item configuration breakdown

**What's already in the data:** each `quote_items` row carries a `configuration` JSONB (and `product_snapshot`). Example from the live DB:

```json
{
  "page_count": 84,
  "quantity": 5,
  "is_color": true,
  "is_duplex": true,
  "binding_edge_override": null,
  "selected_options": {
    "Binding":          "comb-binding-black",
    "Covers":           "frosted-front-black-card-back",
    "Cover Lamination": "no-lamination",
    "Document Size":    "a4-210-297mm",
    "Paper Stock":      "80gsm-white-bond",
    "Page Lamination":  "no-lamination",
    "Tab Dividers":     "no-tab-dividers",
    "Inserts":          "no-inserts",
    "Finishing":        "no-additional-finishing",
    "Print to Edge":    "none-standard-margins"
  }
}
```

So everything the admin needs is already persisted — we just don't render it.

**Approach:** under each line row, draw a compact, indented "specification" sub-table.

a. **Resolve slug → human label.** Slugs like `80gsm-white-bond` aren't pretty. The function already loads the tenant; we'll additionally fetch the `product_options` rows for each distinct `product_family_id` in the quote (one query, one `.in()`). For each `selected_options` entry, look up the matching value in `product_options.values` (JSONB array of `{ label, slug, ... }` — see `src/lib/productOptionTypes.ts`) and use `value.label`. If no match, fall back to a title-cased version of the slug.

b. **Derived rows.** Surface the non-`selected_options` fields too:
   - Print Colour ← `is_color ? "Full colour" : "Black & white"`
   - Print Sides  ← `is_duplex ? "Double sided" : "Single sided"`
   - Pages       ← `page_count`
   - Binding edge override (only if non-null)

c. **Hide noise.** Skip any value whose slug starts with `no-` / contains `none-` (e.g. `no-lamination`, `no-inserts`) so admins only see *applied* options, not a wall of "no-".

d. **Layout.** Inside the existing item-row loop:
   - After drawing the description/qty/price line, render a two-column key/value list at 8pt in the muted grey already in use, indented to `C.desc.x + 12`.
   - Pair them: `Document Size: A4 (210×297mm)   ·   Paper: 80gsm White Bond` etc., 2 per line, so a 10-option product fits in ~5 lines.
   - Recompute `rowH` to include this block; the existing `ensureSpace(rowH + 4)` page-break logic handles pagination automatically.

e. **Customer vs admin view.** Both customer and admin currently fetch the same PDF (single `pdf_storage_path` on the quote). Two options:
   - **(Recommended, simplest)** Always include the breakdown. It's useful for the customer too — they see exactly what they're being quoted on — and matches how the rest of the app surfaces specs.
   - **(Alternative)** Add a `?detailed=1` mode that regenerates with the breakdown for admin-only download. Costs more (two PDFs, cache busting) and the value to the customer is real, so I'd skip it unless you specifically want a "clean" customer copy.

   I'll go with option 1 unless you say otherwise.

---

### Files touched

- `supabase/functions/quote-pdf/index.ts` — only file changed. Edge function auto-deploys.

### Out of scope

- No DB migrations (data is already there).
- No frontend changes.
- No changes to filename, quote number, or banking blocks.
