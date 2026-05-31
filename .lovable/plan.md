# Fix hole-punch side for simplex loose / stapled pages

## Problem
In `LooseSheetsPreview`, the back-face flag (which flips hole punches to the right edge) is computed from page parity alone:

```ts
const isBackFace = currentPage % 2 === 1;
```

That assumes a duplex sheet where every odd page is the reverse of the previous one. For **simplex** loose sheets / stapled jobs every printed page is its own one-sided sheet, so the holes should stay on the left for every page.

## Fix

1. **Pass a per-page duplex flag into the preview.**
   - `buildPreviewSnapshot` already attaches the originating `section` (with `is_duplex`) to every page. Surface a parallel `duplexFlags: boolean[]` (true = page belongs to a duplex section).
   - In `PreviewPanel.tsx` derive `duplexFlags` from `finalPages.map(p => p.section?.is_duplex ?? true)` and pass it through `DocumentPreview` → `LooseSheetsPreview` (and `PreviewLightbox`).

2. **Use it in `LooseSheetsPreview`.**
   - Replace the parity-only computation with:
     ```ts
     const isDuplex = duplexFlags?.[currentPage] ?? true;
     const isBackFace = isDuplex && currentPage % 2 === 1;
     ```
   - That keeps the existing duplex behaviour (holes alternate L/R) and forces simplex pages to render as front faces (holes on the left).

3. **Type plumbing.**
   - Add optional `duplexFlags?: boolean[]` to `PreviewComponentProps` in `src/components/preview/previewTypes.ts` so all preview components accept it without churn. Only `LooseSheetsPreview` consumes it for now; bound previews already drive hole side via `BACK_FACE_ROLES` in `PageEffects`, so they're unaffected.

## Scope
Frontend preview only — no changes to pricing, snapshot schema, or stored data. No backend / migration impact.
