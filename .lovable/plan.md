# Customer-editable colour blocks in artwork templates

Add a third placeholder kind — a **colour block** — alongside image and text boxes. The admin draws and positions it (customer cannot move or resize it); the customer clicks it and enters a CMYK colour, which is written to the press PDF as exact DeviceCMYK ink values.

This is very feasible: the template pipeline already draws flat fills and already converts fills to DeviceCMYK. The work is mostly plumbing a new box kind through the editor, the customer builder and the spec.

## What the admin gets

- A third button in the template editor: **Draw colour box**, next to Draw image box / Draw text box.
- The box behaves like existing boxes for geometry (mm from the trim top-left, layers, z-order, opacity, corner radius) but has no fit/upload settings.
- A **default CMYK** value (C/M/Y/K, 0–100) set by the admin — what prints if the customer never touches it.
- A **Customer can change colour** toggle. Off = fixed decoration; on = editable at order time.

## What the customer gets

- The colour block appears in the placeholder list beside the image/text boxes, showing a swatch and its CMYK read-out.
- Clicking it opens four numeric C/M/Y/K fields (0–100) with a live swatch. Geometry stays locked — no drag, no resize.
- The on-canvas preview fills the box with the screen approximation of that CMYK, in the same draw order as everything else, so a colour block behind the calendar artwork still reads correctly.
- A short note that screen colour is indicative and CMYK values are what print.

## Print output

- The spec carries the CMYK numbers, not a hex colour. The PDF server fills the box with `CMYKColor(c/100, m/100, y/100, k/100)` directly — no RGB round-trip, so a 0/0/0/100 black stays 100% K and a brand colour keeps its exact build.
- Hex is derived only for on-screen preview; it never reaches the PDF.

## Technical notes

- `src/lib/artworkTemplates/types.ts`: `PlaceholderKind` gains `"colour"`. New `ArtworkCmyk = { c; m; y; k }` (0–100). `ArtworkPlaceholder` gains `default_cmyk: ArtworkCmyk | null` and `customer_editable_colour: boolean`. New `TemplatedColourValue { placeholder_id; kind: "colour"; cmyk: ArtworkCmyk; }` added to the `TemplatedPlaceholderValue` union. Helper `cmykToHex()` for preview only.
- Migration: add `default_cmyk jsonb` and `customer_editable_colour boolean default true` to the artwork placeholder table; `kind` check constraint extended to allow `colour`. Existing rows untouched.
- `src/lib/artworkTemplates/renderTemplate.ts`: `drawPlaceholder` gets a `colour` branch — rounded clip path, `globalAlpha` from opacity, fill with `cmykToHex(value ?? default)`.
- `src/components/artwork/TemplateBoxEditor.tsx`: new add button + default factory, CMYK inputs and the editable toggle in the inspector, badge label `COL`, and the existing image-only controls skipped for this kind.
- `src/components/artwork/PlaceholderPanel.tsx`: new colour branch — four CMYK number inputs plus swatch; renders read-only when `customer_editable_colour` is false.
- `src/components/artwork/TemplatedArtworkBuilder.tsx`: seed each colour placeholder's value from `default_cmyk` on load; colour boxes never count towards required-upload validation.
- `ArtworkAdminProof` / `ArtworkProofModal` / customer order detail: no change needed — they render through `renderTemplate`.
- `pdf-server/app/services/templated_artwork_assembly.py`: handle `kind == "colour"` in the overlay loop — fill the box rect with the spec's CMYK via `CMYKColor` (fall back to `default_cmyk`, then to the current `_cmyk(background_hex)` path). Bump `templated_artwork_pipeline_version` so cached assemblies re-render.
- Order specs snapshot `placeholder_defs`, so a later admin colour change cannot alter an already-placed order.
