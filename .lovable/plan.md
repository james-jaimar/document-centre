

## Bleed-aware "near-match" paper size detection

### Problem
A client uploads an A5 booklet at 160×222mm. The PDF has no trim box set, so the system reads the media box (which includes ~6mm bleed per side). Current logic:
- 160×222 is not within 3mm of A5 (148×210) → not detected as ISO
- 160×222 doesn't match any US size → `detectNonIsoSize` returns `null`
- Result: no advisory shown, file treated as a mystery custom size

This is a common real-world scenario — many clients supply files with bleed but no trim box metadata.

### Solution
Add a new detection tier: **"near-standard with possible bleed"**. When a file doesn't exactly match any ISO size but is close (within typical bleed range of 3–15mm per side), show a new advisory dialog that lets the user either:

1. **Declare the intended size** — pick from matching ISO sizes (e.g. "This is A5 with bleed")
2. **Enter a custom bleed/trim amount** — e.g. "6mm bleed on all sides"
3. **Keep as-is** — treat the full dimensions as the finished size

When the user specifies bleed, the system calls `cropRasterize` with the calculated trim box coordinates to regenerate thumbnails from the trimmed area, and stores the intended size + bleed info in `preflight_data` for production use.

### File changes

**`src/lib/paperSizes.ts`**
- Add `detectNearIsoWithBleed(widthMm, heightMm)` function — checks if dimensions are within 3–15mm per side of any ISO size. Returns `{ matchedSize, bleedW, bleedH }` or null.
- Keep existing `detectNonIsoSize` for US sizes. New function runs as a fallback when both ISO exact-match and US-match return null.

**`src/hooks/useDocumentUpload.ts`**
- After the existing `detectNonIsoSize` check, call `detectNearIsoWithBleed`. If it returns a match, store `{ near_iso_match: "A5", estimated_bleed_w: 6, estimated_bleed_h: 6 }` in `preflight_data`.

**`src/components/order/BleedAdvisory.tsx`** (new file)
- Dialog showing: "This file is 160×222mm — close to A5 (148×210mm) with approximately 6mm bleed."
- Options:
  - **"This is A5 with bleed"** — pre-selected, shows the detected bleed amount
  - **"Set custom trim"** — lets user enter bleed in mm (single value applied to all sides, or per-side)
  - **"Keep full size (no trim)"** — treat 160×222 as the finished size
- Confirm button triggers the trim/crop flow

**`src/pages/dashboard/OrderFiles.tsx`**
- Add state + useEffect for bleed advisory (similar pattern to existing `advisoryDoc`)
- Detect documents with `preflight_data.near_iso_match` and no `bleed_resolved`
- `handleApplyBleed` callback: calculates trim box from bleed values, calls `cropRasterize` on the backend asset, updates document dimensions to the trimmed size, regenerates thumbnails via existing `reThumbnail`, stores resolution in `preflight_data`
- Render `<BleedAdvisory>` dialog

### User flow
1. User uploads a 160×222mm PDF (A5 + bleed, no trim box)
2. Upload completes → system detects "near A5 with ~6mm bleed"
3. Bleed advisory dialog appears: "This looks like A5 with bleed. How should we handle it?"
4. User confirms "A5 with bleed" → system crops to A5 trim area, regenerates previews
5. Document now shows as 148×210mm (A5) in the configurator with clean trimmed previews

### Edge cases
- Landscape documents: bleed detection works in both orientations
- Multiple documents: advisory shows one at a time (same pattern as existing size advisory)
- Already has trim box: existing `cropRasterize` flow during upload already handles this — the new detection only fires when trim box equals media box (i.e. no trim box was set)

