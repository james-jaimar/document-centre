

## Fix Print Colour / Print Sides — make per-section the only source of truth

### Problem

In the second screenshot the user uploaded earlier, the "Your Document" panel shows `Colour` + `Duplex` chips per uploaded file — that's where the customer sets it, and that's the source of truth.

In the work order (first screenshot), "Print Colour" appears **twice** with different values:
- "Print Colour: Full Colour" (stale)
- "Print Colour: Black & White" (correct)

**Root cause** in `src/pages/dashboard/OrderBuild.tsx` lines 186–207: the defaults loop auto-fills `selected_options["Print Colour"] = "full_colour"` and `selected_options["Print Sides"] = "duplex"` even though these options are filtered out of the customer-facing `OptionsPanel`. They never get updated to match what the customer actually picks per-section, so they sit stale in `spec.selected_options`.

When `buildJobSnapshot` runs at order placement:
1. `resolveSelectedOptions` picks up the stale `"Print Colour": "full_colour"` and renders it under the "Print Colour" group.
2. `buildPrintColourSection` *also* derives a fresh "Print Colour" line from the actual `document_sections.is_color`.

Result: two conflicting rows.

### Fix

**1. `src/pages/dashboard/OrderBuild.tsx` (defaults loop)**
- Skip the section-controlled options when seeding defaults so they never enter `spec.selected_options`:
  ```ts
  const SECTION_CONTROLLED = new Set(["Print Colour", "Print Sides"]);
  for (const opt of options) {
    if (SECTION_CONTROLLED.has(opt.name)) continue;
    // ... existing default seeding
  }
  ```

**2. `src/lib/orders/buildJobSnapshot.ts`**
- Strip section-controlled keys from `selected` *before* calling `resolveSelectedOptions`, so any legacy values that may already be persisted on draft/cart specs are ignored:
  ```ts
  const SECTION_CONTROLLED = new Set(["Print Colour", "Print Sides"]);
  const cleaned = Object.fromEntries(
    Object.entries(selected).filter(([k]) => !SECTION_CONTROLLED.has(k))
  );
  ```
- Keep the existing `buildPrintColourSection` (derived from `document_sections`) as the single rendered source.
- Rename the section title from `"Print Colour"` to `"Print"` so it doesn't visually clash with anything else, and so the heading reads cleanly above the two rows (Print Colour / Print Sides).

**3. `src/hooks/useCart.ts` — wire the work-order's `production_specs`**

Right now `production_specs` is left as `{}`. The grayscale/resize jobs are fired but never recorded on the job. Build a `production_specs` object per job from the per-section truth so production staff and downstream integrations have it explicitly:

```ts
production_specs: {
  print_colour: allBW ? "black_and_white" : allColour ? "full_colour" : "mixed",
  print_sides:  allSimplex ? "simplex" : allDuplex ? "duplex" : "mixed",
  sections: itemSections.map(s => ({
    label: s.label,
    section_type: s.section_type,
    is_color: s.is_color,
    is_duplex: s.is_duplex,
    paper_stock: s.paper_stock,
    paper_weight_gsm: s.paper_weight_gsm,
  })),
  documents: itemDocs.map(d => ({
    file_name: d.file_name,
    backend_asset_id: d.backend_asset_id,
    page_count: d.page_count,
    page_width_mm: d.page_width_mm,
    page_height_mm: d.page_height_mm,
  })),
  derived_assets: { /* populated as grayscale/resize jobs complete — phase 2 */ },
}
```

Pass it into the `jobs[]` payload sent to `order-engine` so it lands on `order_jobs.production_specs`.

### Result

- Job Detail Panel shows **one** clean "Print" section:
  ```
  Print Colour     Black & White
  Print Sides      Duplex (Double-sided)
  ```
  driven entirely by what the customer picked in the uploaded-files list.
- The job's `production_specs` JSONB now holds an authoritative, machine-readable record of colour/sides/sections/documents for the work order — ready for the PDF-server pipeline to consume.

### Files changed

| File | Change |
|------|--------|
| `src/pages/dashboard/OrderBuild.tsx` | Skip "Print Colour"/"Print Sides" when seeding `selected_options` defaults |
| `src/lib/orders/buildJobSnapshot.ts` | Strip section-controlled keys before resolving; rename section to "Print" |
| `src/hooks/useCart.ts` | Build & attach `production_specs` from per-section truth on each job payload |

