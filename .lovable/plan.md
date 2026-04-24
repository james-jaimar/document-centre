

## Photo Prints — fix the silent background render

### What's actually happening

Edge function logs show:
```
[render-photo-prints] start order_item=b04bc610…
[render-photo-prints] done   order_item=b04bc610… merged=null
```

The function ran end-to-end without throwing, but produced no merged PDF. That means every photo failed inside its per-photo `try/catch` block, the function then hit `pagesToMerge.length === 0`, threw "nothing to merge", and the spec was never updated — so the admin gallery polls forever.

### Why the photos fail

The browser hook (`usePhotoRenderQueue`) reaches Document Centre via the `pdf-api` edge function, which:
1. Authenticates the user
2. Forwards the request to `DOCUMENT_CENTRE_API_URL`

The new `render-photo-prints` function bypasses that proxy and calls `DOCUMENT_CENTRE_API_URL` **directly with no auth header**. Document Centre almost certainly rejects unauthenticated requests, every `dcRequest` throws, and the merge never happens. The errors are logged inside the per-photo `console.error` but the logs we can see only show the start/done lines.

There are also two secondary problems that would bite us even if the auth was fine:
- **Failure is invisible**: when the merge step throws, the spec never gets a `render_failed_at` marker, so the gallery shows "Preparing…" indefinitely instead of an actionable error.
- **Per-photo errors are not surfaced**: only the outer summary line is logged, making future debugging painful.

### Fix

**1. Reuse the `pdf-api` proxy from inside `render-photo-prints`**

Instead of calling `DOCUMENT_CENTRE_API_URL` directly, the edge function will forward each Document Centre call to the existing `pdf-api` edge function over HTTP, passing the caller's JWT. This is the exact path the browser uses, so behaviour is guaranteed to match.

```
render-photo-prints  ──Bearer <user JWT>──►  pdf-api  ──►  Document Centre
```

The user's JWT is already on the incoming request (we use it for `auth.getUser()`); we just thread it through to `pdf-api`.

**2. Persist failure state to the spec**

Wrap the whole `renderForOrderItem` body in a try/catch that, on failure, patches the order item's `spec.photo_prints` with:
- `render_failed_at`
- `render_error` (short message)
- `render_attempts` (incremented)

The admin gallery will then stop showing "Preparing…" and instead show an error pill with a "Retry" button (calls the function again).

**3. Log every Document Centre call**

Add `console.log` for `path` + upstream status in `dcRequest`, and `console.error` with the photo file name + the raw error text when a per-photo render fails. This makes future regressions diagnosable from edge function logs alone.

**4. Update the admin gallery**

`PhotoPrintsAdminGallery.tsx` polls every 5s today. Extend the polling state to recognise:
- `merged_storage_path` set → show Download button (current behaviour)
- `render_failed_at` set → show red pill "Render failed: <reason>" with a small **Retry** button that POSTs to `render-photo-prints` again
- otherwise → "Preparing print-ready PDF…" (current behaviour)

### Files to change

| File | Change |
|---|---|
| `supabase/functions/render-photo-prints/index.ts` | Route all Document Centre calls through the `pdf-api` edge function with the caller's JWT; wrap full render in try/catch and persist `render_failed_at` / `render_error` on failure; add per-call logging |
| `src/components/orders/detail/PhotoPrintsAdminGallery.tsx` | Surface `render_failed_at` with a Retry button alongside the existing "Preparing…" / Download states |

No DB schema changes. No customer-facing UI changes. No changes to the browser hook (kept for any future "regenerate from admin" button).

### Verification

1. Place a fresh photo-prints order in the demo tenant.
2. Edge function logs should show one log line per `pdf-api` call with status `200`.
3. Within ~30–60 s the order item's `spec.photo_prints.merged_storage_path` is populated and a `documents` row with `kind: "photo_prints_merged"` exists.
4. Admin opens the order → "Print-ready PDF" download button appears.
5. If Document Centre is briefly down, the gallery shows "Render failed" with a working **Retry** button instead of looping on "Preparing…".

