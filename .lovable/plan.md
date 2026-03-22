

# Fix: Remove bucket prefix from `source_storage_path`

## Problem
The backend calls `from_(bucket).download(storage_path)` — it already knows the bucket name. We're sending `document-uploads/{path}` which duplicates the bucket name, causing the file lookup to fail.

## Fix
One line in `src/hooks/useDocumentUpload.ts` (~line 41):

```typescript
// FROM:
const fullStoragePath = `document-uploads/${storagePath}`;

// TO:
const fullStoragePath = storagePath;
```

That's it. `storagePath` is already `{userId}/{orderItemId}/{fileName}`, which is the correct object key within the `document-uploads` bucket.

