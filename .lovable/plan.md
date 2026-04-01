

# Plan: Seed All Remaining Product Families

## Overview

We already have **Bound Documents** (13 option categories, 100+ values, 8 pricing rules). We now need to create 7 more product families, each as a seed function following the same pattern. All are seeded at the app level (no `tenant_id`).

## Product Families to Create

### 1. Presentations
Identical to Bound Documents but landscape/short-edge binding. Sizes: A5, A4, A3 landscape (binds on short edge — 297mm max for A3).

- **Options reused from Bound Documents**: Binding, Covers, Cover Lamination, Paper Stock, Print Colour, Print Sides, Print to Edge, Page Lamination, Hole Punching, Tab Dividers, Inserts, Finishing
- **Changed**: Document Size → A5 Landscape, A4 Landscape, A3 Landscape (short-edge bind, 297mm)
- **Metadata addition**: `orientation: "landscape"`, `binding_edge: "short"` on all size values

### 2. Ring Binders
Subset of Bound Documents focused on ring binder binding only.

- **Binding**: Only the Ring Binder options (D-Ring 25mm–65mm)
- **Covers**: Subset — No Cover, Clear/Frosted (front only matters less), Printed Covers
- **Reused**: Paper Stock, Print Colour, Print Sides, Document Size (portrait only), Hole Punching (default 4-hole), Tab Dividers, Inserts
- **Removed**: Cover Lamination (binder has own cover), Print to Edge, Page Lamination, Finishing (no stapling on ring binder)

### 3. Stapled & Loose Pages
Simple product — no binding or covers.

- **Document Size**: A4, A5, A3, US Letter
- **Paper Stock**: Full set from Bound Documents
- **Print Colour**: B&W, Full Colour, Mixed
- **Print Sides**: Simplex, Duplex, Mixed
- **Finishing**: Staple options + Collate & Rubber Band, Shrink Wrap, No Staple (loose)
- **Hole Punching**: Optional
- **No**: Binding, Covers, Cover Lamination, Print to Edge, Page Lamination, Tabs, Inserts

### 4. Posters
Very limited set — single sheet, no binding.

- **Document Size**: A3, A2, A1, A0, custom (wide format)
- **Paper Stock**: Limited — 120gsm Silk, 160gsm Silk, 200gsm Silk Card, 250gsm Gloss Card, Photo Paper
- **Print Colour**: Full Colour only (default), B&W
- **Print Sides**: Single Sided only
- **Page Lamination**: Gloss, Matt, Encapsulated, None
- **No**: Binding, Covers, Print to Edge, Hole Punching, Tabs, Inserts, Finishing

### 5. Booklets (Saddle Stitched)
Similar to Bound Documents but saddle-stitched (stapled spine). Max ~64 pages.

- **Binding**: Fixed — Saddle Stitched (no choice, implicit)
- **Document Size**: A5, A4 (folds to A5), A4 landscape
- **Covers**: Printed Cover options (same stock or heavier), No separate cover
- **Cover Lamination**: Full set
- **Paper Stock**: Subset (80gsm–160gsm, coated options)
- **Print Colour**: B&W, Full Colour
- **Print Sides**: Always Duplex (implicit for booklets)
- **Print to Edge**: None, Entire Document, Covers Only
- **No**: Hole Punching, Tab Dividers, Inserts, Finishing (binding is the finish)

### 6. Flyers
Single or double-sided sheets, no binding. Focus on heavier stocks and lamination.

- **Document Size**: A6, A5, A4, A3, DL (99×210mm)
- **Paper Stock**: Heavier stocks — 130gsm Silk, 160gsm Silk, 200gsm Silk, 250gsm Silk, 300gsm Silk, Gloss equivalents
- **Print Colour**: Full Colour (default), B&W
- **Print Sides**: Single Sided, Double Sided
- **Page Lamination**: Gloss, Matt, Soft Touch, None
- **Print to Edge**: None, Full Bleed (default for flyers)
- **No**: Binding, Covers, Hole Punching, Tabs, Inserts

### 7. Brochures / Folded Leaflets
Folded sheets — bi-fold, tri-fold, z-fold, gate-fold.

- **Fold Type** (new option): Bi-Fold, Tri-Fold, Z-Fold, Gate-Fold
- **Document Size**: A4 (folds to DL/A5), A3 (folds to A4)
- **Paper Stock**: Heavier stocks same as Flyers
- **Print Colour**: Full Colour (default), B&W
- **Print Sides**: Always Double Sided (implicit)
- **Page Lamination**: Gloss, Matt, Soft Touch, None
- **Print to Edge**: None, Full Bleed
- **No**: Binding, Covers, Hole Punching, Tabs, Inserts

## Implementation

### New file: `src/lib/seedAllProducts.ts`
- Contains 7 individual seed functions (`seedPresentations`, `seedRingBinders`, etc.)
- Each follows the exact same pattern as `seedBoundDocument`: create family → insert options → insert pricing rules
- Reuses option value arrays where possible (imported from shared constants)
- Each is idempotent (checks slug before inserting)

### Refactor: `src/lib/productOptionValues.ts` (new shared file)
- Extract common option value arrays (Paper Stock, Print Colour, Print Sides, etc.) from `seedBoundDocument.ts` into a shared module
- Both `seedBoundDocument.ts` and `seedAllProducts.ts` import from this shared file
- Avoids duplicating 200+ lines of option definitions

### Update: `src/pages/admin/AdminProducts.tsx`
- Add a "Seed All Products" button alongside the existing "Seed Bound Document" button
- Calls each seed function in sequence, skipping any that already exist
- Shows progress toast for each product family created

### Update: `src/pages/dashboard/NewOrder.tsx`
- Add more icons to `ICON_MAP` for the new product families (Presentation, Scissors, Image, BookText, FileSpreadsheet, Layers)

## Pricing Rules per Product

Each product family gets its own pricing rules (same structure as Bound Documents):
- B&W and Colour per-page base rates
- Setup fee (varies by product — posters higher, flyers lower)
- Volume discounts
- Product-specific surcharges where needed

## Files Summary

| File | Action |
|------|--------|
| `src/lib/productOptionValues.ts` | New — shared option value arrays |
| `src/lib/seedAllProducts.ts` | New — 7 seed functions |
| `src/lib/seedBoundDocument.ts` | Modify — import shared values |
| `src/pages/admin/AdminProducts.tsx` | Modify — add "Seed All" button |
| `src/pages/dashboard/NewOrder.tsx` | Modify — expand icon map |

## Implementation Order
1. Extract shared option values into `productOptionValues.ts`
2. Refactor `seedBoundDocument.ts` to use shared values
3. Create `seedAllProducts.ts` with all 7 product seed functions
4. Update AdminProducts with "Seed All Products" button
5. Update NewOrder icon map

