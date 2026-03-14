

## PDF API Proxy Edge Function

### What we're doing
Storing the VPS PDF API key as a secret and creating an Edge Function proxy at `supabase/functions/pdf-api/index.ts` that securely forwards requests to `https://pdf-api.jaimar.dev`.

### Steps

1. **Store secrets** — Add `VPS_PDF_API_KEY` (the key you just provided) and `VPS_PDF_API_URL` (`https://pdf-api.jaimar.dev`)

2. **Create Edge Function** — `supabase/functions/pdf-api/index.ts`
   - Validates authenticated user via `getClaims()`
   - Routes based on a `path` field in the request body (e.g. `preflight`, `manipulate/rotate`, `imposition/labels`)
   - Forwards the request JSON to the VPS with the `X-API-Key` header
   - Returns JSON responses directly, binary PDF responses as base64
   - Handles 503 "busy" responses with a clear error message to the client
   - CORS headers included

3. **Update config.toml** — Register `pdf-api` with `verify_jwt = false`

### Client usage
```typescript
// Preflight a PDF
const { data } = await supabase.functions.invoke('pdf-api', {
  body: { path: 'preflight', pdf_url: signedUrl }
});

// Rotate a PDF
const { data } = await supabase.functions.invoke('pdf-api', {
  body: { path: 'manipulate/rotate', pdf_url: signedUrl, angle: 90 }
});

// Label imposition
const { data } = await supabase.functions.invoke('pdf-api', {
  body: { path: 'imposition/labels', dieline: {...}, slots: [...], ... }
});
```

### Supported routes
All VPS endpoints proxied: `/health`, `/preflight`, `/page-boxes`, `/analyze-pdf`, `/manipulate/rotate`, `/manipulate/crop`, `/manipulate/split`, `/convert/cmyk`, `/imposition/labels`, `/verify-pdf`

