# Fix: PowerPoint custom slide sizes bypass the paper-size advisory

## The bug

When a PowerPoint is uploaded, the Office → PDF conversion runs via LibreOffice and the resulting PDF is inspected exactly like a normal PDF (good). The inspector calls `detectNonIsoSize(width, height)` and `detectNearIsoWithBleed(...)`. If neither fires, `hasAdvisory = false` and the document is silently finalised at its original (weird) size.

The PPTX you uploaded was the standard PowerPoint "Widescreen" deck — 13.333 × 7.5 in ≈ **339 × 191 mm**. That:

- isn't an ISO A-series size,
- isn't one of the 5 US/ANSI sizes in `NON_ISO_SIZES`,
- isn't "near-ISO with bleed" (the deltas are 42 mm and -19 mm, far outside the 3–15 mm bleed window).

So `detectNonIsoSize` returns `null`, `detectNearIsoWithBleed` returns `null`, no advisory is shown, and the deck prints at 339×191 mm. PDFs and Word docs trip the same code path, but because Word/PDF defaults are almost always A4 or US Letter, they hit one of the existing matchers — PowerPoint slips through because slide decks are routinely authored at non-paper sizes.

## The fix

Add a generic "unrecognised size" branch to the advisory pipeline so anything that isn't ISO, isn't one of the listed US sizes, and isn't near-ISO-with-bleed still surfaces the existing `PaperSizeAdvisory` dialog with sensible scale targets.

### 1. `src/lib/paperSizes.ts`

- Add a new exported helper `detectKnownPaperSize(widthMm, heightMm)` returning one of: `{ kind: "iso", size }`, `{ kind: "non_iso", size }`, or `null`.
- Add a constant for **PowerPoint Widescreen (16:9)** (338.7 × 190.5 mm) and **PowerPoint Standard (4:3)** (254 × 190.5 mm) to `NON_ISO_SIZES` (or a new `PRESENTATION_SIZES` list that `matchKnownSize` also consults) so they get a friendly name in the dialog ("PowerPoint Widescreen") instead of a generic label.
- Loosen `getSuggestedIsoSizes` so that for very wide/short pages (aspect > 1.6 or < 0.625, i.e. presentation aspect ratios) it still returns at least `A4` and `A3` as scale targets even when the area ratio is outside the current 0.5–2.0 band — otherwise the dialog would render with zero scale options.

### 2. `src/hooks/useDocumentUpload.ts` — `inspectExistingAsset`

Replace the current advisory gate:

```ts
const detectedSize = detectNonIsoSize(pageWidthMm, pageHeightMm);
const nearIsoMatch = !detectedSize ? detectNearIsoWithBleed(...) : null;
const hasAdvisory = !!detectedSize || !!nearIsoMatch || !!orientationMismatch;
```

with:

```ts
const isoMatch         = matchIsoSize(pageWidthMm, pageHeightMm);
const knownNonIso      = !isoMatch ? detectNonIsoSize(pageWidthMm, pageHeightMm) : null;
const nearIsoMatch     = !isoMatch && !knownNonIso ? detectNearIsoWithBleed(...) : null;
const unknownSize      = !isoMatch && !knownNonIso && !nearIsoMatch;
const detectedSizeLabel = knownNonIso ?? (unknownSize ? "Custom size" : null);
const hasAdvisory = !!detectedSizeLabel || !!nearIsoMatch || !!orientationMismatch;
```

Persist `detected_size = detectedSizeLabel` into `preflight_data` exactly as today, so `PaperSizeAdvisory` opens with the same data shape it already consumes. No DB schema change.

### 3. `src/components/order/PaperSizeAdvisory.tsx` (light copy tweak)

When `detectedSize === "Custom size"` show body copy along the lines of *"This isn't a standard ISO paper size — we recommend scaling it onto A4 (or A3) before printing"*, instead of the existing "non-ISO US size" wording. No structural change — the existing scale-to-A* / keep-original buttons already do the right thing.

### Out of scope

- Backend changes (LibreOffice conversion stays as-is — converting at the deck's native size and letting the advisory + resize step handle scaling is what we already do for Word docs).
- Auto-scaling without prompting. The fix matches the existing UX where the user is shown the size and offered A4/A3 targets.
- Changes to bleed detection or orientation policy.

## Verification

1. Upload a default PowerPoint Widescreen deck → advisory opens, labelled "PowerPoint Widescreen (339 × 191 mm)", A3/A4 scale options offered.
2. Upload a US-Letter PDF → still triggers existing "US Letter" advisory (unchanged).
3. Upload an A4 PDF → no advisory (unchanged).
4. Upload an A4+5 mm-bleed PDF → still hits near-ISO bleed advisory (unchanged).
