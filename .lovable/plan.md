The Firefox result confirms this is not a stale browser/cache issue. The request is reaching `pdf-api`, but some calls are receiving Supabase’s platform-level 503 response before our function code can reliably complete. Recent logs show heavy `pdf-api` boot/shutdown churn during upload polling, with successful upstream VPS responses mixed in, so the right fix is client-side resilience around the proxy calls.

## Plan

1. Centralise retry handling in `src/lib/documentCentreApi.ts`
   - Update the shared `request()` helper used by `createAsset`, `inspectAsset`, `printReady`, `generatePreviews`, `getJob`, etc.
   - Retry transient Supabase/edge failures instead of failing the upload immediately.
   - Treat these as retryable:
     - HTTP `502`, `503`, `504`, `429`
     - response body containing `SUPABASE_EDGE_RUNTIME_ERROR`
     - browser fetch/network failures while calling `/functions/v1/pdf-api`

2. Use exponential backoff with jitter
   - Example delays: about `750ms`, `1.5s`, `3s`, `6s`, capped.
   - Keep retry count modest for POST operation-creation calls so the UI recovers from edge worker hiccups without multiplying backend work unnecessarily.
   - Keep `GET v1/jobs/:id` polling tolerant because polling is where the logs show lots of short-lived edge worker boots.

3. Make polling tolerant of transient misses
   - Update `pollJob()` so a single 503 while checking job status does not abort the whole upload.
   - Continue polling after transient failures and only fail once the retry budget is exhausted.

4. Improve user-facing progress and diagnostics
   - Log a concise console warning like `[doc-centre] transient 503 for GET v1/jobs/... retrying in 1500ms`.
   - Keep the upload modal in “Queued / waiting for server…” instead of switching to hard error during recoverable interruptions.

5. Optional consistency pass
   - Mirror the same transient retry helper into `src/hooks/usePdfApi.ts` for any remaining components that still use the hook directly.
   - This prevents the same Supabase platform hiccup from affecting non-upload PDF operations.

## Technical notes

No database change is required. No S3 change is required. This is not the earlier CORS problem: CORS is now fixed, and the current error is a Supabase Edge Runtime 503 from `pdf-api` during Document Centre processing.

The fix is safe because it is limited to retrying short-lived platform/runtime failures. Real validation failures, auth failures, forbidden requests, bad paths, or upstream document-processing errors will still surface normally.