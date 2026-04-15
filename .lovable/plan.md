

## S3 Storage Migration — Implementation Plan

### Overview

Migrate all file storage from Supabase Storage (`document-uploads` bucket) to AWS S3 (`jaimar-dev-600743178200-af-south-1-an`), using the Lovable connector gateway for URL signing. The S3 connection is already linked and secrets are available.

### What Changes

**1. New Edge Function: `supabase/functions/s3-storage/index.ts`**

Handles three actions via the connector gateway:
- **`sign-upload`** — Returns a presigned PUT URL for uploading a file to a given S3 key
- **`sign-download`** — Returns presigned GET URLs for one or more S3 keys (batch)
- **`delete`** — Deletes one or more S3 objects

All actions authenticate the user via Supabase JWT and validate the requested key prefix against the user's tenant membership. Uses the gateway at `https://connector-gateway.lovable.dev/api/v1/sign_storage_url?provider=aws_s3`.

**2. Frontend: `src/hooks/useDocumentUpload.ts`**

Replace `supabase.storage.from("document-uploads").upload()` with:
1. Call `s3-storage` edge function (`sign-upload`) to get a presigned PUT URL
2. `fetch(putUrl, { method: 'PUT', body: file })` to upload directly to S3

Update storage path format to: `{tenant_id}/uploads/{user_id}/{order_item_id}/{filename}`

**3. Frontend: `src/lib/thumbnailUtils.ts`**

Replace `supabase.storage.from(BUCKET).createSignedUrls()` and `createSignedUrl()` with calls to the `s3-storage` edge function (`sign-download`). Keep the existing TTL cache logic — just swap the signing backend.

**4. Frontend: Delete operations (3 files)**

Replace `supabase.storage.from("document-uploads").remove()` with calls to `s3-storage` (`delete`):
- `src/hooks/useCart.ts` (2 locations)
- `src/pages/dashboard/OrderFiles.tsx` (1 location)
- `src/pages/dashboard/CustomerOrders.tsx` (1 location)

**5. S3 Bucket CORS Configuration**

You'll need to add CORS to your S3 bucket so browser-based uploads/downloads work. I'll provide the exact AWS CLI command.

### S3 Key Structure

```text
{tenant_id}/uploads/{user_id}/{order_item_id}/{filename}.pdf
{tenant_id}/derived/{asset_id}/previews/page-001.png
{tenant_id}/derived/{asset_id}/thumbs/page-001.png
```

### VPS Instructions (after app changes)

Once the app migration is complete, I'll provide exact instructions for your Ubuntu Document Centre API:
1. Install `boto3`
2. Add S3 config to `.env` (`STORAGE_MODE=s3`, AWS credentials)
3. Patch `config.py` with new S3 fields
4. Patch `storage.py` with S3 read/write mode
5. Restart the service

### Execution Order

1. Create `s3-storage` edge function and deploy
2. Test it via `curl_edge_functions`
3. Update `thumbnailUtils.ts` (signing)
4. Update `useDocumentUpload.ts` (uploads)
5. Update delete operations (3 files)
6. Provide S3 CORS config command
7. Provide VPS patch instructions

### Important Notes

- The `documents.file_path` column will store S3 object keys instead of Supabase paths — same format, different backend
- Existing files in Supabase Storage will remain accessible until migrated — we can add a migration script later
- All previews remain private (presigned GET URLs), not public

