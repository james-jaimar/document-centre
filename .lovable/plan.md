

## Fix: S3 Upload Fails for Filenames with Spaces

### Root Cause (Confirmed)

The Lovable connector gateway has a URL-encoding issue with spaces in `object_path`. When the path contains spaces, the gateway signs the URL with one encoding but S3 expects another, causing `SignatureDoesNotMatch`.

**Proof:**
- `test/diagnostic.txt` → **200 OK**
- `test/PriceList2026.pdf` → **200 OK**
- `test/Price List 2026_Impress.pdf` → **403 SignatureDoesNotMatch**
- `test/Price%20List%202026.pdf` (pre-encoded) → **403 SignatureDoesNotMatch**

This is a gateway-level bug. Credentials and permissions are fine.

### Fix

**File: `src/hooks/useDocumentUpload.ts`** — Sanitize the filename in the S3 object key before uploading. Replace spaces and unsafe characters with underscores. The original filename is preserved in `file_name` in the database for display.

```ts
// Line ~314, change:
const storagePath = `${user.id}/${effectiveId}/${fileName}`;

// To:
const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
const storagePath = `${user.id}/${effectiveId}/${safeFileName}`;
```

Also update the DB insert (where `file_path` is stored) to use the same `safeFileName` so downloads reference the correct S3 key. The `file_name` column keeps the original name for UI display.

### Scope

- One file changed: `src/hooks/useDocumentUpload.ts`
- No edge function, VPS, or AWS changes needed
- No database migration needed
- `file_name` (display) stays as original; `file_path` (S3 key) uses sanitized name

### VPS Impact

The VPS `storage.py` receives the S3 key from the `file_path` column, so it will automatically use the sanitized key. No VPS patch needed.

