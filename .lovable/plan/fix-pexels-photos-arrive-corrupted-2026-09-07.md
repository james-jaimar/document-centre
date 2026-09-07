# Fix: Pexels photos arrive corrupted

## What's happening

Picking a photo from the library appears to work, but the picture never renders — the console shows the preview build failing and then "image load failed" on the uploaded file. The file lands in storage, but its contents are damaged, so nothing can open it.

## Cause

The photo is fetched from Pexels through our own server and returned as raw image bytes. The way the browser side currently calls that server, the response is read as **text** rather than binary (the Supabase client only treats a response as binary when the server labels it as a generic download). Text decoding mangles JPEG bytes, so what gets uploaded is a broken file.

## Fix

1. In the browser helper (`src/lib/stockImages/pexels.ts`), replace the client `invoke` call with a direct `fetch` to the `stock-images` function — same pattern already used and proven in `src/lib/downloadFile.ts` (session token + apikey headers) — and read the reply with `res.blob()`. That keeps the bytes intact.
2. In the edge function (`supabase/functions/stock-images/index.ts`), also pass through `Content-Length` and label the reply as a download (`Content-Disposition: attachment`) so any client treats it as binary, and return a clear JSON error if Pexels declines.
3. Guard the picker: if the downloaded file fails a quick "can this be read as an image" check, show a friendly message and don't place it, instead of silently placing a broken box.

## Also in scope (small)

- The `DialogContent` accessibility warning in the console: add the missing description to whichever dialog is raising it in the artwork builder flow.

## Verify

Pick a photo in the calendar builder, confirm the thumbnail renders in the box, the crop/zoom works, and the proof shows the photo. Check the console is clean of the two errors above.
