## Problem

A 28-page A5 PDF uploaded into an A4-locked session currently:
1. Inspects boxes (fast — seconds)
2. Runs CMYK print-ready
3. **Renders all 28 pages of thumbnails** (slow — and for a 200-page doc, 8–10 minutes)
4. *Only then* OrderFiles' `useEffect` notices "A5 ≠ A4 lock" and pops the "Different size from other files" dialog

The lock-mismatch check needs to fire immediately after the box read, before any rasterising, so the user can pick "Scale to A4 / Keep A5" up-front.

## Root cause

- `inspectExistingAsset` in `src/hooks/useDocumentUpload.ts` decides `hasAdvisory` purely from intrinsic file properties (non-ISO, near-ISO bleed, orientation). An exact-ISO file like A5 always returns `hasAdvisory = false`.
- The session size lock lives in `OrderFiles.tsx` state and is not visible to the upload hook, so the hook can't gate Phase B render on it.
- The lock-mismatch dialog (OrderFiles lines 877–920) only opens once preflight is fully done (`awaiting_review: false`), i.e. after rendering.

## Plan

### 1. Thread the session size lock into the upload hook

`src/hooks/useDocumentUpload.ts`
- Add an optional `sessionLockedSize?: PaperSize | null` arg to `useDocumentUpload({ ... })`.
- Pass it through `uploadFile` → `inspectDocument` → `inspectExistingAsset` (read via ref so an in-flight upload sees the latest lock without restarting the closure).

`src/pages/dashboard/OrderFiles.tsx`
- Forward `sessionSizeLock?.size ?? null` when constructing the upload hook.

### 2. Detect lock-mismatch during Phase A inspect (before render)

In `inspectExistingAsset`, after computing `isoMatch` for the incoming file:

- If `sessionLockedSize` is set AND the file's dimensions match an exact ISO size AND that ISO size differs from the lock:
  - Set a new preflight flag `locked_size_mismatch: true` along with `locked_against: <lock.name>`.
  - Treat as `hasAdvisory = true` → skip `finalizeOrientationAndPrintReady`, skip Phase B render, set `awaiting_review: true`.
- This piggybacks on the existing "defer render until user resolves" path.

### 3. Open the dialog from the new flag instead of waiting on `awaiting_review: false`

`src/pages/dashboard/OrderFiles.tsx` (lock-mismatch effect ~line 877)
- Replace the "exact-ISO + lock mismatch" detection with a check for `preflight_data.locked_size_mismatch === true` (or fall through to current ISO check for legacy docs).
- When dialog resolves:
  - "Scale to A4" → existing `applyScaleTo` (already runs prepare-for-product + render).
  - "Keep A5 / override lock" → existing `applyKeepOriginal` (already runs finalize + render).
  - Either branch clears `locked_size_mismatch` (alongside the existing `size_resolved` write).

### 4. No server changes

The PDF-server inspect job already returns boxes synchronously — that is what the user described as "almost instantly". No `pdf-server/` changes needed for this fix.

## User-visible result

Upload of `28pp A5.pdf` into an A4-locked session:
1. ~2–5 s: "Inspecting PDF…" → boxes read.
2. Dialog opens: "Different size from your other files — Scale to A4 / Keep A5".
3. User picks → CMYK + rasterisation runs *once* against the chosen target. No wasted render of A5 thumbnails that get thrown away when the user scales to A4.

## Files touched

- `src/hooks/useDocumentUpload.ts` — new arg, Phase-A lock-mismatch detection.
- `src/pages/dashboard/OrderFiles.tsx` — pass lock into hook, key lock-mismatch effect off the new preflight flag, clear flag on resolve.
