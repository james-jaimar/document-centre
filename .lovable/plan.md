## Plan

1. **Update product-family detection**
   - Rename/adjust the current `isSingleSheetFamily` logic so it also includes folded leaflet/brochure families.
   - Include the existing `brochures` slug and common variants such as `brochure`, `folded-leaflets`, `folded_leaflets`, `folded-leaflet`, and `folded_leaflet`.

2. **Reuse the existing section collapse**
   - Keep the pricing-only collapse in `OrderBuild.tsx`: Front/Outside + Back/Inside become one physical sheet.
   - For a two-sided folded leaflet, send the calculator one duplex section with `page_count: 2` instead of two separate two-page sections.
   - This should price as one A4 landscape colour duplex click plus one physical sheet of paper, rather than two clicks plus two sheets.

3. **Preserve bound documents**
   - Do not change saddle-stitched booklets, bound documents, or mixed-section documents; those must continue pricing per section.

4. **Add a small guard in the collapse labels**
   - Ensure the collapse works whether sections are labelled `Cover`/`Back Cover` or folded-leaflet wording like `Outside`/`Inside` if present.

5. **Verify by inspecting the pricing breakdown**
   - Confirm the brochure/folded leaflet case no longer shows two separate print lines for Outside/Inside and drops from roughly `R26.40` to the expected single-sheet amount.