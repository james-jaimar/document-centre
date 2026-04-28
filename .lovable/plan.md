# "Storage temporarily unavailable" during upload

## What that message means

That wording comes from our own code — it is **not** an AWS or Supabase error string. It's the deliberately customer-friendly message we surface whenever the S3 upload pipeline hits a transient failure that survives all our retries.

It is produced in two places:

1. **`supabase/functions/s3-storage/index.ts`** (the edge function) — `friendlyError(...)` returns
   `"Storage is temporarily unavailable while preparing your upload. Please retry shortly."`
   when the call to the Lovable connector gateway (`/api/v1/sign_storage_url?provider=aws_s3&mode=write`) fails after 4 retries.

2. **`src/lib/s3Storage.ts`** (the browser client) — `userFacingError(...)` returns
   `"Storage is temporarily unavailable while uploading the file. Please try again in a moment."`
   when either the edge-function call or the direct PUT to S3 fails after 4 retries.

So the colleague did **not** hit a raw S3 outage — they hit our retry ceiling on a transient blip (most commonly: a Supabase edge worker recycle / `WORKER_LIMIT`, or the connector gateway returning a 5xx, or a momentary browser network drop).

## What I want to do

### 1. Confirm the root cause from logs

Pull `s3-storage` edge function logs around the time of the incident and look for:
- `sign-upload failed [5xx]` lines (gateway hiccup)
- `transient … retrying` warnings that exhausted all 4 retries
- `WORKER_LIMIT` / `SUPABASE_EDGE_RUNTIME_ERROR` markers

This tells us whether it was the **sign-URL leg** (edge → gateway) or the **PUT leg** (browser → S3) that gave up. The fix differs slightly per leg.

### 2. Make the upload pipeline more forgiving

Regardless of which leg failed, two cheap improvements would have likely made this invisible to the user:

- **Bump retry budget** from 4 → 6 attempts on both sides (`DEFAULT_MAX_RETRIES` in `s3Storage.ts` and in `s3-storage/index.ts`). Total wall-clock stays under ~25s with current backoff curve.
- **Re-sign the URL on PUT failure**. Right now `uploadToS3` retries the PUT against the **same** presigned URL. If the URL itself was the problem (rare, but happens if the gateway returned a malformed URL), all retries fail identically. Add: on the 2nd PUT failure, request a fresh presigned URL and try again before surfacing the error.
- **Surface a one-tap "Retry upload" affordance** in the toast/error UI for that file row, so even when we do bail the user isn't stuck re-dragging the file in.

### 3. Add a tiny breadcrumb for ourselves

Log the `x-request-id` (or generate one) on every `sign-upload` call and include it in the user-facing error as a short tag like `(ref: ab12cd)`. Next time a colleague reports it, we can grep logs in seconds.

## Files I expect to touch

- `src/lib/s3Storage.ts` — bump retries, add re-sign-on-failure, thread a request id through the thrown error.
- `supabase/functions/s3-storage/index.ts` — bump retries, attach a request id to responses, log it on every gateway call.
- The upload UI (likely `src/hooks/useDocumentUpload.ts` and the relevant tile component) — render a "Retry" button on a failed row instead of just a toast.

## Out of scope

- No schema changes, no new buckets, no new edge functions.
- Not switching off the connector gateway — it's working as designed; this is purely about absorbing transient blips more gracefully.

## Next step

If you approve, I'll start by pulling the actual edge-function logs from around the incident so I can pick the correct retry-budget number and confirm which leg failed, then implement the three fixes above.
