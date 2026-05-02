
# QR Code Mobile Photo Upload

A customer working on their order on desktop clicks "Upload from Phone", sees a QR code, scans it with their phone, selects photos from their gallery, and watches them appear in real-time on the desktop — no app install, no login on mobile.

## How It Works

```text
Desktop                          Mobile Phone
───────                          ────────────
1. Click "Upload from Phone"
2. Generate upload session
3. Show QR code modal ──────────► 4. Scan QR code
   (polling for new photos)       5. Opens minimal upload page
                                  6. Select photos / take photo
                                  7. Upload starts (progress shown)
8. Photos appear live ◄────────── 
9. Close modal when done
```

## Technical Architecture

### Upload Session (database)

A new `upload_sessions` table stores temporary, token-based sessions:

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid | Primary key |
| token | text (unique) | Short random token for the URL |
| order_item_id | uuid | Which order item receives the photos |
| tenant_id | uuid | Tenant context |
| created_by | uuid | The authenticated user who created it |
| expires_at | timestamptz | Auto-expire after 30 minutes |
| is_active | boolean | Can be manually closed |

RLS: creator can read/update their own sessions. The mobile upload page uses an Edge Function (no direct DB access from anonymous users).

### Mobile Upload Page (public, no auth required)

A new route `/upload/:token` renders a minimal, mobile-optimised page:
- No navigation chrome, no sidebar — just the upload UI
- Shows tenant branding (logo, name) fetched via the session
- Large "Select Photos" button that triggers the native file picker with `capture` attribute for camera access
- Multi-file select from gallery
- Simple progress bars per file
- "Done" button to close the session

This page calls a dedicated Edge Function for all operations (validate token, upload files, create document records). The customer never needs to log in.

### Edge Function: `mobile-upload`

Handles the unauthenticated mobile side:

- **GET** `?token=xxx` — Validates token, returns tenant branding + order context (no sensitive data)
- **POST** `?token=xxx` — Receives multipart file upload, stores to S3, creates `documents` row linked to the `order_item_id`

Security:
- Token validated against `upload_sessions` table
- Checks `expires_at` and `is_active`
- Rate-limited (max 50 files per session, max 50MB per file)
- No auth token needed — the session token IS the authorization

### Real-Time Sync (Desktop)

The desktop modal subscribes to Supabase Realtime on the `documents` table, filtered by `order_item_id`. When new rows appear (uploaded from phone), they instantly show in the desktop UI — the customer sees thumbnails appearing live.

```typescript
supabase.channel('mobile-uploads')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'documents',
    filter: `order_item_id=eq.${orderItemId}`
  }, (payload) => {
    // Add new photo to the UI
  })
  .subscribe();
```

### QR Code Generation

Client-side using a lightweight library (`qrcode.react` or `qrcode`). The QR encodes the full URL:

```
https://document-centre.com/upload/{token}
```

Or for tenant custom domains:
```
https://{tenant-domain}/upload/{token}
```

## Files to Create/Modify

### New Files
1. **Migration** — `upload_sessions` table with RLS policies
2. **`supabase/functions/mobile-upload/index.ts`** — Edge Function for token validation and file upload
3. **`src/pages/MobileUpload.tsx`** — Minimal mobile upload page (public route)
4. **`src/components/order/QRUploadModal.tsx`** — Desktop modal with QR code and live photo feed
5. **`src/hooks/useUploadSession.ts`** — Create session, generate token, subscribe to realtime

### Modified Files
6. **`src/App.tsx`** — Add `/upload/:token` route (outside auth guard)
7. **`src/components/photo/PhotoUploader.tsx`** — Add "Upload from Phone" button
8. **`src/pages/dashboard/PhotoPrintsBuilder.tsx`** — Integrate QR upload modal
9. **`src/components/order/FileUploader.tsx`** — Add "Upload from Phone" option for document uploads too

### Dependencies
- `qrcode.react` — QR code rendering (~12KB)

## Scope and Considerations

- Works for both photo prints and document uploads
- No mobile app needed — pure browser experience
- Sessions auto-expire after 30 minutes for security
- The token URL is short-lived and single-purpose
- Works on any phone with a camera and browser
- Tenant branding on the mobile page builds trust
- Could later extend to support signature capture or document scanning
