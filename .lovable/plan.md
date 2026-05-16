# Make PVC covers honour the B&W print-colour choice

## Problem

When the customer chooses **Black & White** for a bound document and then picks a **PVC front cover** (clear / frosted / matte), the body pages render in greyscale correctly, but the cover sheet renders in full colour. The cover is unaware of the print-colour choice the customer made in the previous step.

## Root cause

In `src/lib/orders/buildPreviewSnapshot.ts` (line 371), when a PVC cover sheet is injected, its `isColor` flag is hardcoded:

```ts
fp.unshift({ thumbnailUrl: frontThumb, pageIndex: 0, isColor: true });
```

The PVC cover artwork is just a re-display of the first body page's thumbnail (`fp[0].thumbnailUrl`). That body page already carries the correct `isColor` value (derived from `section.is_color`), but the cover slot ignores it.

Downstream renderers (`FlipBook`, `LooseSheetsPreview`, `RingBinderOpenSpread`) all read `colorFlags[i]` and apply `filter: grayscale(100%)` correctly — so fixing the snapshot fixes every preview type at once.

## Fix

Single-line change in `buildPreviewSnapshot.ts`:

```ts
const frontSource = fp[0];
fp.unshift({
  thumbnailUrl: frontSource?.thumbnailUrl ?? "",
  pageIndex: 0,
  isColor: frontSource?.isColor ?? true,
});
```

The PVC back face stays `isColor: true` (it's a translucent reverse with no artwork).

## Scope check (app-wide?)

- **Real `front_cover` sections** (uploaded cover artwork, not PVC): already correct — `isColor` flows from `section.is_color` via `buildPageSequence` (line 250).
- **Card back covers** (`back_cover_card`, `inside_back_cover_card`): solid colour material, no artwork, `isColor` irrelevant.
- **Tabs / inserts / blanks**: no artwork, `isColor` irrelevant.
- **All three preview engines** (flip book, loose sheets, ring binder) consume the same `colorFlags` array, so this one fix propagates everywhere.

No other surfaces need touching.

## Verification

1. Bound document → choose **Black & White**, upload a colour PDF, pick **Matte PVC** cover → cover should now render greyscale, matching the body.
2. Repeat with **Frosted PVC** and **Clear PVC** — all greyscale.
3. Switch back to **Full Colour** → cover renders in colour as before.
4. Sanity-check ring-binder and saddle-stitch previews — no regression.

## Out of scope

- Print-ready assembly pipeline (already converts to greyscale at paid-order time — unaffected).
- Cover artwork upload flow.
- Any pricing logic.
