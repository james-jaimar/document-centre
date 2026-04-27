## The Bug

After clicking **Rotate 90° to Portrait**, the rotation runs, but the "Landscape Document Detected" modal pops up a second time. Tracing the code:

1. `handleRotateOrientation` calls `renderWithProgress(...)` (writes new thumbnails + dimensions).
2. Inside `renderDocumentThumbnails` (`useDocumentUpload.ts`, lines 226–249), the document row is updated with `preflight_data: { ...existingPreflight, ... }` — **this carries the stale `orientation_mismatch` flag forward** because nothing strips it. It also does **not** add `orientation_resolved: true`.
3. React Query invalidation fires (`qc.invalidateQueries`) → `documents` state updates with the rotated dimensions BUT still containing `orientation_mismatch`.
4. Only **after** `renderWithProgress` returns does `OrderFiles.handleRotateOrientation` write the cleanup row that removes `orientation_mismatch` and adds `orientation_resolved: true` (line 690), then `setOrientationDoc(null)` (line 699), then `refetchDocuments()` (line 700).
5. Between steps 3 and 4 the orientation `useEffect` is gated by `orientationDoc` being non-null, so it doesn't re-fire there. **But** at step 5, after `setOrientationDoc(null)`, if the React Query refetch from step 3 settles before the cleanup write at step 4 lands in cache (a real race because supabase `update` doesn't auto-refetch and we kick `refetchDocuments` at line 700), the documents snapshot in state still has `orientation_mismatch === "to-portrait"` and `orientation_resolved` unset → the useEffect re-opens the advisory.

In short: `renderDocumentThumbnails` clobbers the resolution status by re-writing preflight without sanitising orientation flags, and the post-rotate cleanup write is sequenced after `renderWithProgress` instead of before.

## Fix

**File: `src/hooks/useDocumentUpload.ts`** (`renderDocumentThumbnails`, around lines 230–249)
- When building `nextPreflight`, **strip `orientation_mismatch`** (the file is now being rendered, so the mismatch is being resolved one way or another).
- This also fixes the symmetric race for the "Dismiss" branch.

**File: `src/pages/dashboard/OrderFiles.tsx`** (`handleRotateOrientation`, lines 650–707)
- **Mark the document as resolved BEFORE calling `renderWithProgress`** — write `preflight_data: { ...rest (no orientation_mismatch), orientation_resolved: true, orientation_action: "rotated", awaiting_review: false }` and the swapped `page_width_mm` / `page_height_mm` first. This ensures every subsequent React Query refetch (including the one triggered inside `renderWithProgress`) sees a resolved row.
- Keep the `inspectAsset` + `pollJob` re-inspection step.
- Remove the now-redundant post-render write (or keep it as a defensive idempotent re-write — preferred: keep, but it no longer races).
- Continue with `renderWithProgress` to (re)generate thumbnails. Final `setOrientationDoc(null)` + `refetchDocuments()` stay at the end.

**File: `src/pages/dashboard/OrderFiles.tsx`** (orientation `useEffect`, lines 303–344)
- Add a defensive guard: when the persisted-flag fast-path is **not** set (`preflight?.orientation_mismatch !== mode`), skip the dimension-only fallback **if** `preflight?.orientation_resolved === true`. This prevents the dimension-fallback path from re-triggering for a document the user has already resolved (e.g. if the rotated dimensions briefly look the same in cache during a refetch).

## Result

- Rotate flow: cleanup write happens first → `renderWithProgress`'s mid-flight invalidation sees a resolved row → useEffect never re-fires.
- Dismiss flow: `renderDocumentThumbnails` no longer re-introduces a stale `orientation_mismatch`; the post-render cleanup is now also race-free.
- Modal appears exactly once per upload, regardless of the resolution path.

No changes to `OrientationAdvisory.tsx` or backend behaviour.
