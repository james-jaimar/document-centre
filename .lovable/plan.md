# Let customers cancel an upload in progress

## The problem

On a slow connection an upload can sit at "Uploading…" for minutes with no way
out. The only cancel that exists today is the Stop button on the multi-page PDF
spread. A single image, a single PDF, or a photo picked from the photo library
has no cancel at all — the customer has to reload the page, and even then the
request keeps running in the background.

## What the customer will get

- **Cancel on every upload.** While a picture box says "Uploading…", a Cancel
  link sits next to it. Tapping it stops the transfer immediately and the box
  returns to "Click to upload your file", ready for another go.
- **Cancel on the photo library.** Choosing a photo shows a spinner on that tile
  with a Cancel button; cancelling closes nothing else and the library stays
  open so they can pick a different photo.
- **Cancel on the print-ready PDF drop zone** in the uploaded-artwork editor
  while the file is being checked and sent.
- **Clear wording.** A cancelled upload says "Upload cancelled" — never an error
  or a "try again" warning.
- **No half-finished work.** Cancelling before the picture is saved leaves the
  box exactly as it was; anything already placed (for example pages 1–4 of a
  multi-page spread) stays put, as it does today.

## Technical notes

Cancellation is an `AbortSignal` threaded from the UI down to every network
call, plus a matching `AbortError` path that is never retried and never
surfaced as a failure.

- `src/lib/s3Storage.ts`
  - Add an optional `signal` to `uploadToS3`, `getUploadUrl`, `downloadFromS3`
    and the internal `callS3Function`/`withRetry`/`withAuthRecovery` helpers.
  - Pass `signal` into the S3 `PUT` fetch and the `download` fetch.
  - `supabase.functions.invoke` takes no signal, so `withRetry` checks
    `signal.aborted` before each attempt and before each backoff sleep, and the
    sleep itself rejects on abort.
  - New `isAbortError(err)` (name `AbortError` / `signal.aborted`): skip retry,
    skip the auth-refresh path, and rethrow a shared `UploadCancelledError`
    instead of a user-facing "Couldn't upload" message.
- `src/hooks/usePhotoUpload.ts` — `uploadPhoto(file, itemId, { signal })`:
  pass it to the three parallel `uploadToS3` calls, abort before the `documents`
  insert so a cancelled upload never creates a row, and mark the progress entry
  `cancelled` rather than `error` (no toast).
- `src/lib/stockImages/pexels.ts` — `fetchStockPhotoFile(photo, signal)`
  forwards the signal to its `fetch`.
- `src/pages/dashboard/TemplatedArtworkBuilder.tsx`
  - One `uploadAbort = useRef<AbortController | null>(null)`, created at the top
    of `handlePickFile` and cleared in its `finally`; a `cancelUpload()` callback
    aborts it and also sets the existing `cancelPlacing.current = true` so the
    same control stops a multi-page run.
  - Pass the signal to `uploadToS3` (source PDF), `uploadPage`/`uploadPhoto` and
    the stock-photo fetch; swallow `UploadCancelledError` in the catch and show
    `toast.message("Upload cancelled")`.
  - Pass `onCancel` down to `PlaceholderPanel` and `StockImagePicker`.
- `src/components/artwork/PlaceholderPanel.tsx` — when `busy`, render a small
  "Cancel" text button under the spinner wired to the new `onCancel` prop
  (click stops propagation so it doesn't re-open the file dialog).
- `src/components/artwork/StockImagePicker.tsx` — the tile spinner shown while
  `pickedId === p.id && busy` gains a Cancel button on the same `onCancel`.
- `src/pages/dashboard/UploadedArtworkBuilder.tsx` — same controller pattern
  around `handleFile`, with a Cancel button in the busy drop zone.

## Verification

In preview, throttle the network, start an image upload in the deskpad editor,
cancel it, and confirm the box resets, no document row is created and the toast
reads "Upload cancelled". Repeat for a photo-library pick and for the
print-ready PDF drop zone, then run a normal uncancelled upload to confirm
nothing regressed.
