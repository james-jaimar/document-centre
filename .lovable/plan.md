

# Fix: VPS Returning 404 for /analyze-pdf

## Problem

The edge function is now authenticating correctly (the `getUser` fix worked), but the VPS at `VPS_PDF_API_URL` is returning **404 Not Found** for `/analyze-pdf`. The constructed URL `${vpsUrl}/analyze-pdf` doesn't match what the VPS expects.

Possible causes:
1. `VPS_PDF_API_URL` ends with a trailing slash, creating `https://pdf-api.jaimar.dev//analyze-pdf`
2. `VPS_PDF_API_URL` includes a path prefix like `/api/v1`, and the VPS expects routes under that prefix
3. The VPS FastAPI app mounts its routes differently than expected

## Plan

### 1. Add full URL logging to the edge function (`supabase/functions/pdf-api/index.ts`)
- Log the exact constructed URL (with the VPS base stripped for security, but showing the full path)
- Trim trailing slashes from `vpsUrl` before concatenation to prevent double-slash issues

### 2. Deploy and test with the health endpoint
- The `/health` endpoint should be the simplest to verify
- Use the existing test file to confirm the URL is constructed correctly

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/pdf-api/index.ts` | Trim trailing slash from `vpsUrl`, log the full constructed URL for debugging |

This is a small, targeted fix. Once we can see the actual URL being hit and confirm `/health` works, we'll know the exact path format the VPS expects.

