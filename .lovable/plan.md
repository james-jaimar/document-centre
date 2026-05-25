# Hide Supabase Storage URL from Customers

## Problem
When a customer downloads a quote PDF, the browser opens a raw `https://<project>.supabase.co/storage/v1/object/sign/...` URL. This leaks the backend provider and looks unprofessional.

## Solution
Stream the PDF bytes through our own edge function so the customer only ever sees a URL on our domain. No signed Supabase URL is ever returned to the client.

## Changes

### 1. `quote-pdf` edge function
- Add a new mode: when called with `?download=1` (or `mode: "stream"` in body), return the PDF binary directly with:
  - `Content-Type: application/pdf`
  - `Content-Disposition: inline; filename="Quote-Q-00002.pdf"`
- Keep existing JSON mode (`storage_path`) for `send-quote-email` and other server-to-server callers.
- Reuse the same generator; if the snapshot already exists in storage, fetch and stream it; otherwise generate, save, then stream.

### 2. `useDownloadQuotePdf` hook (`src/hooks/useQuotes.ts`)
- Replace `functions.invoke` + `window.open(signedUrl)` with a `fetch` to the function URL using the user's access token, get the blob, then:
  - Create an object URL via `URL.createObjectURL(blob)` and `window.open` it, OR
  - Trigger a download via a temporary `<a download>` element.
- Result: the visible URL is either a `blob:` URL (download/open) or our app domain — never `*.supabase.co`.

### 3. `useBranchQuotes` PDF download
- Same treatment as the customer hook for consistency.

## Out of scope
- No changes to the PDF layout, branding, banking, or RLS work already shipped.
- `send-quote-email` continues to use the JSON/storage path mode internally — recipients only see the emailed attachment, no Supabase URL.

## Technical notes
- The fetch must include `Authorization: Bearer <access_token>` and `apikey` headers; the edge function already validates the user via `supabase.auth.getUser()`, so RLS-equivalent checks remain.
- Blob URLs are origin-scoped to our app, so the customer sees e.g. `blob:https://document-centre.com/...` instead of Supabase.
