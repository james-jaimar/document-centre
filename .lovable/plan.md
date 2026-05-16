# Render previews at 100% — drop the simulated cut-sheet margin

## Problem

Every non-bleed page in every preview type (loose sheets, flip book / bound, ring binder) is rendered with a ~3% inset on all four sides, supposedly to simulate the unprintable white border of a cut-sheet copier. This shrinks the artwork inside the page and makes documents look wrong, especially for typical Word/PowerPoint uploads where the file already has its own margins.

Source of the shrink: `src/components/preview/PageEffects.tsx`, line 251:

```ts
const inset = allowBleed ? 0 : bleedInsetPx;
```

`bleedInsetPx` is computed upstream as `~3%` of page/canvas width in `LooseSheetsPreview`, `FlipBook`, and `RingBinderOpenSpread` and passed in.

## Fix

Render artwork edge-to-edge of the page rectangle in the preview. The page rectangle itself is still drawn at the correct paper size, so the user sees their A4 at A4 — just without an extra fake margin layered on top of the margins their file already contains.

### Change

`src/components/preview/PageEffects.tsx` — set the content frame inset to 0 unconditionally:

```ts
const inset = 0;
```

`allowBleed` / `bleedInsetPx` / `bleedFlags` stay in the prop signatures for now (other effects code paths read `allowBleed`), but they no longer control content positioning. We can clean the unused plumbing in a follow-up once we're sure nothing visual regressed.

### Out of scope

- No change to the print-ready pipeline. The "auto-expand for bleed" logic in `pdf_ops` / `production_tasks` still kicks in at assemble time when print-to-edge is selected without bleed — that is correct and stays.
- No change to which products offer print-to-edge. You mentioned you'll separately disable edge-to-edge on bound docs and presentations via product options; that's a config change in the admin, not a code change here.
- Crop-mark clipping via `trimCrop` in `LooseSheetsPreview` / `PdfPageView` is unrelated and stays.

## Verification

- Loose sheets: upload an A4 PDF with its own 20 mm margins → preview shows the PDF flush to the page edges, with the file's own white margin visible (instead of the file's margin plus an extra fake margin).
- Bound (wire/comb/saddle/perfect): same — body pages render edge-to-edge of the page rectangle.
- Ring binder: same on both open-spread and closed views.
- Print-to-edge products (flyers, posters, business cards): unchanged — those already set `allowBleed=true` and were already inset 0.
- Cover laminations, hole punches, paper colour swatches, tab overlays: visually unchanged (they target `absolute inset-0` on the outer page div, not the content frame).
