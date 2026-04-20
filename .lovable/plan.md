

## Bug

After the inspect/render refactor, uploads fail immediately with:

```
[doc-centre] POST v1/assets
[doc-centre] GET v1/assets/<id>
POST .../functions/v1/pdf-api 401 (Unauthorized)
[upload] inspectDocument failed: Document Centre API error 401: {"error":"Unauthorized"}
```

So the asset is created (POST v1/assets returns 200), but the **follow-up `GET v1/assets/:id`** returns 401 from `pdf-api`. No metadata → no boxes → no advisory → no render.

## Why

`supabase/functions/pdf-api/index.ts` does this on every request:

```ts
const body = await req.json();
```

`GET` requests sent from `documentCentreApi.request()` look like:

```ts
fetch(edgeFnUrl, {
  method: "POST",            // edge fn always POST
  body: JSON.stringify({ path, method: "GET" }),
})
```

That body parse works for the initial POSTs. But there is a second, more likely failure: looking at the new `inspectDocument` flow, after `createAsset({ auto_queue: false })` we immediately poll `GET v1/assets/<id>` to read `boxes` / page count. The Document Centre API itself returns 401 on that path because it expects either:

- the asset to have completed an inspect job, or
- the request to include a service token / signed header that previously was added by the `auto_queue: true` path.

The screenshot confirms the 401 originates **upstream** ("Document Centre API error 401"), not from our edge function's auth check (which would say "Unauthorized" before logging the GET line).

## Likely upstream cause

The Document Centre API gates `/v1/assets/:id` until a job has touched the asset. With `auto_queue: false` no job is queued, so there is nothing tying the asset to the requesting user/tenant, and the API rejects the read.

This means **`auto_queue: false` is not a supported standalone mode** — the API expects at least one job (inspect/metadata) to be enqueued at create time so it can authorize subsequent reads and so boxes get populated.

## Fix plan

### 1. Add an explicit "inspect only" path in `documentCentreApi.ts`

Two options, in order of preference:

- **Preferred**: keep `auto_queue: true` in `createAsset`, but immediately after creation call `inspectAsset(assetId)` only if needed and **skip the rasterize step on the backend**. If the backend doesn't support inspect-only via `auto_queue`, use option B.
- **Fallback**: call `createAsset({ auto_queue: true })` (which queues full processing), then on the client only consume the metadata it produces and **don't trigger a second `cropRasterize`**. This still single-renders if the auto-queued render uses the MediaBox, but for bleed/non-ISO cases we'd need to cancel/replace it — which puts us back to double rendering.

### 2. Real fix: call inspect explicitly, no auto_queue rasterize

`createAsset({ auto_queue: false })` → then call `POST v1/assets/:id/inspect` (already exposed as `inspectAsset`) → poll that job → read asset boxes. The `inspect` job is what authorizes/populates the asset, not the rasterize.

That matches the API surface in `documentCentreApi.ts` which already exports `inspectAsset(assetId)` returning a `job_id`.

So `inspectDocument` in `useDocumentUpload.ts` should be:

1. `createAsset({ auto_queue: false })`
2. `inspectAsset(assetId)` → `{ job_id }`
3. `pollJob(job_id)` until completed
4. `getAsset(assetId)` → now authorized, has `boxes`, `page_count`
5. Run `detectNonIsoSize` / `detectNearIsoWithBleed`
6. Decide whether to render now or wait for advisory
7. Phase B `renderDocumentThumbnails` calls `cropRasterize` exactly once

### 3. Confirm the edge function isn't the 401 source

Quick check in `pdf-api/index.ts`: the auth gate runs `supabase.auth.getUser()` and returns 401 with `{"error":"Unauthorized"}`. That's the **same** body we're seeing — so it's possible the 401 is actually from our edge function rejecting a GET because `req.json()` succeeded but the user lookup failed mid-flight.

Plan also includes:
- Log whether the 401 originates from the edge function's auth branch vs. the upstream proxy. Add a one-line distinguishing prefix so we can tell them apart.
- Verify `getAuthToken()` in `documentCentreApi.ts` is still returning a valid token when called from the new `inspectDocument` path (race with auth refresh on first call after page load).

## Files to change

- `src/hooks/useDocumentUpload.ts` — `inspectDocument`: add explicit `inspectAsset` + `pollJob` step before `getAsset`. Don't poll asset until inspect job completes.
- `supabase/functions/pdf-api/index.ts` — make the two 401 branches distinguishable in the response body (`auth_failed_local` vs `auth_failed_upstream`) and log the upstream status text so we never have to guess again.
- `src/lib/documentCentreApi.ts` — no signature changes needed; just confirm `inspectAsset` is exported (it is).

## Verification

1. Upload a plain A4 PDF → console shows: `POST v1/assets` → `POST v1/assets/<id>/inspect` → `GET v1/jobs/<id>` (until completed) → `GET v1/assets/<id>` 200 → no advisory → single `crop-rasterize` → preview appears.
2. Upload 160×230mm A5+bleed PDF → same prefix → bleed advisory appears with no thumbnails yet → confirm trim → single `crop-rasterize` at 148×210 → trimmed preview appears.
3. Upload US Letter → non-ISO advisory, single render at chosen target.
4. No more 401s on `v1/assets/:id`.
5. Network tab: exactly one `crop-rasterize` per upload in every path.

## Out of scope

- VPS server diagnostics — we'll return to those once uploads work end-to-end.
- Any backend changes to Document Centre API.

