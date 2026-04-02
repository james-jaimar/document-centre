

# Plan: Adapt Upload UI for Product Type (Brochures, Flyers, Posters)

## Problems

From the screenshots, when uploading files for brochures:

1. **Confusing labeling**: Each uploaded page shows "1 page" — but for brochures it's a single sheet with an outside and inside. Users don't understand the relationship.
2. **Duplex toggle on single pages**: A 1-page PDF can't be duplex. The toggle shouldn't appear, and brochures are inherently double-sided anyway.
3. **Wrong section actions**: "Front Cover / Body Pages / Back Cover" is for bound documents. Brochures need "Outside (front)" and "Inside (back)". Flyers need just "Front" / "Back". Posters need nothing — just auto-assign.

## Solution

Pass the `productFamily.slug` into `SectionActions` and `SectionList` to adapt their UI per product type.

### Section Actions by Product Family

| Family | Actions shown |
|--------|--------------|
| `bound_documents`, `presentations`, `ring_binders`, `booklets`, `stapled_loose` | Front Cover, Body Pages, Back Cover (current) |
| `brochures` | Outside (front of sheet), Inside (back of sheet) |
| `flyers` | Front, Back (optional) |
| `posters` | Auto-add as single sheet (no picker needed, or just "Add as Print") |

### Section List Adaptations

| Family | Changes |
|--------|---------|
| `brochures` | Hide duplex toggle (always duplex). Label sections as "Outside" / "Inside" instead of "Body Pages". |
| `flyers` | Hide duplex toggle for single-sided flyers, or show it labeled "Double-sided". Label as "Front" / "Back". |
| `posters` | Hide both colour and duplex toggles (always colour, always simplex). |
| Default (bound docs) | Keep current behaviour |

### Auto-assign for simple products

For brochures: when 2 files are uploaded, auto-suggest "Outside" for first, "Inside" for second. Or when a single 2-page PDF is uploaded, auto-assign page 1 = outside, page 2 = inside with no section picker needed.

## Changes

| File | Change |
|------|--------|
| `src/components/order/SectionActions.tsx` | Accept `familySlug` prop. Render different action sets based on product family. Map brochure sections to `outside`/`inside` types, flyers to `front`/`back`, posters to `print_sheet`. |
| `src/components/order/SectionList.tsx` | Accept `familySlug` prop. Add labels for new section types (`outside`, `inside`, `front`, `back`, `print_sheet`). Conditionally hide duplex toggle for brochures/posters. Hide colour toggle for posters. |
| `src/pages/dashboard/OrderFiles.tsx` | Pass `productFamily?.slug` to both `SectionActions` and `SectionList`. For brochures, auto-set `is_duplex: true` when adding sections. For posters, auto-set `is_color: true, is_duplex: false`. |

## Implementation Order
1. Update `SectionActions` with family-aware action sets
2. Update `SectionList` with family-aware labels and toggle visibility
3. Wire `familySlug` through from `OrderFiles`

