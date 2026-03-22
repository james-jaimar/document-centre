

# Fix Thumbnail Polling Exit + Lightbox Multi-Page Navigation

## Two issues

1. **Progress stuck at "Rendering pages (1/24)" then jumps to 100%**: The stale-count threshold of 5 polls (~15s) is too aggressive. If the backend renders pages in batches (e.g., all 24 at once after a delay), the count sits at 1 for a few polls, triggers the stale exit, and saves only 1 thumbnail.

2. **Lightbox only shows page 1**: Direct consequence of issue 1 -- only 1 thumbnail path was saved to `thumbnail_urls` in the database, so the lightbox has no pages to navigate.

## Root cause

The stale-count exit breaks too early. With `stalePolls >= 5` at 3-second intervals, that's only 15 seconds of patience. Backend thumbnail rendering for a 24-page PDF can easily take 30-60 seconds with no intermediate progress.

## Fix

### `src/hooks/useDocumentUpload.ts`

1. **Increase stale threshold**: Change from 5 to 15 consecutive stale polls (~45 seconds) before accepting partial results. This gives the backend enough time to render all pages even if they arrive as a batch.

2. **Only apply stale exit when we have a meaningful fraction**: Change the condition from `found > 0` to `found >= expectedPages * 0.8` (80% of pages). If we only have 1 out of 24, we clearly aren't done -- keep waiting. If we have 20 out of 24, it's reasonable to accept.

3. **Better trickle progress during waiting**: When `found` hasn't changed, the time-based component (`i / MAX_THUMB_POLLS * 10`) only gives ~0.17% per poll. Increase the time weight so the bar visibly moves every 3 seconds even when stuck.

Updated polling logic:
```
stalePolls >= 15 && found >= expectedPages * 0.8
```

Updated progress formula -- increase time weight from 10 to 20:
```
progress = 50 + (found / expected) * 20 + (i / MAX_THUMB_POLLS) * 20
```

This ensures: at 0 thumbnails found, progress still trickles from 50% to 70% over 3 minutes. When thumbnails arrive, it jumps proportionally.

No other files need changes. The lightbox and PreviewPanel already handle multiple thumbnails correctly -- they just need the data.

