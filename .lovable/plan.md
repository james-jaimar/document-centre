

# Fix CORS: Route Document Centre API through Edge Function

## Problem
The frontend calls `https://document-centre-api.jaimar.dev/v1/assets` directly from the browser. That server doesn't return `Access-Control-Allow-Origin` headers, so the browser blocks the request.

## Solution
Route all Document Centre API calls through the existing `pdf-api` edge function, which already handles CORS. Two changes needed:

### 1. Rewrite `supabase/functions/pdf-api/index.ts`
- Update `ALLOWED_PATHS` to include the new `/v1/*` routes (`v1/assets`, `v1/jobs`, `v1/operations`, `health`)
- Support both GET and POST methods (currently POST-only)
- Use path-prefix matching instead of exact match (e.g. `v1/assets/xxx/derived-files` matches prefix `v1/assets`)
- Forward the request method, headers, and body to `document-centre-api.jaimar.dev`
- No API key needed for now -- just forward without `X-API-Key`
- Keep auth check (user must be logged in)

### 2. Rewrite `src/lib/documentCentreApi.ts`
- Instead of calling the external URL directly, call the Supabase Edge Function
- Use `supabase.functions.invoke("pdf-api", { body: { path, method, ...payload } })` pattern
- Or simpler: call the edge function URL directly with `fetch`, passing the auth token
- The edge function URL is `${SUPABASE_URL}/functions/v1/pdf-api/{path}`

### Technical detail
The edge function will act as a reverse proxy:
```
Frontend → Edge Function (CORS OK) → document-centre-api.jaimar.dev (server-to-server, no CORS)
```

The edge function already has `VPS_PDF_API_URL` set. We need to either update that secret to point to `https://document-centre-api.jaimar.dev` or add a new `DOCUMENT_CENTRE_API_URL` secret.

### File changes

| File | Action |
|---|---|
| `supabase/functions/pdf-api/index.ts` | Rewrite to proxy `/v1/*` routes with GET+POST, prefix matching |
| `src/lib/documentCentreApi.ts` | Route calls through edge function instead of direct fetch |

