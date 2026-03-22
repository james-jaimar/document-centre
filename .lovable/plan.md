

# Fix Stuck Thumbnail Polling + Smooth Animated Progress Bar

## Problem 1: Polling gets stuck

The thumbnail polling loop waits for `thumbnailPaths.length >= expectedPages` (24), but the backend may not produce exactly 24 derived files with kind `thumbnail_png` or `preview_png`. If the count plateaus at, say, 23 or the backend uses a different naming convention for some pages, the loop runs for the full 3 minutes and stays stuck at "Rendering pages... (1/24)".

**Fix**: Add a "stale count" check. If the thumbnail count hasn't changed for 5 consecutive polls (~15s), accept what we have and move on. This handles the case where the backend is genuinely done but the count doesn't match `page_count`.

### Changes to `src/hooks/useDocumentUpload.ts`

In the thumbnail polling loop (lines 117-125):
- Track `lastCount` and `stalePolls` counter
- If `found === lastCount`, increment `stalePolls`; otherwise reset to 0
- If `stalePolls >= 5` AND `found > 0`, break out of the loop (backend is done)
- Also break if `found >= expectedPages` (the existing condition)

## Problem 2: Progress bar feels jerky

The progress jumps in big chunks (30% → 40% → 50% → stays there). The user wants smooth continuous movement.

**Fix**: Add a CSS transition to the Progress indicator and implement a gentle "trickle" effect during the thumbnail polling phase. Instead of only updating progress when a new thumbnail is found, increment by a small fractional amount on every poll iteration regardless.

### Changes to `src/components/ui/progress.tsx`

Add a smooth CSS transition to the indicator: `transition: transform 1s ease-out` instead of the default `transition-all`.

### Changes to `src/hooks/useDocumentUpload.ts`

During the thumbnail polling loop, calculate progress using both time elapsed AND thumbnails found, so the bar always moves a little on each 3-second poll:

```
progress = 50 + (found / expected) * 30 + (i / MAX_THUMB_POLLS) * 10
```

This gives 30% weight to actual thumbnail progress and 10% to time, ensuring the bar always creeps forward even when no new thumbnails appear.

### Changes to `src/components/order/UploadProgressModal.tsx`

No structural changes needed — it already uses `upload.statusText` and `upload.progress`.

## Files to edit

1. `src/hooks/useDocumentUpload.ts` — stale-count exit + trickle progress
2. `src/components/ui/progress.tsx` — smooth CSS transition

