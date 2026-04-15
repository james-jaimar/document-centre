

## Fix: S3 Upload SignatureDoesNotMatch

### Root Cause

In `src/lib/s3Storage.ts`, the `uploadToS3` function adds a `Content-Type` header to the PUT request. However, the presigned URL from the gateway was signed with only the `host` header. Any additional header not included in the signing causes AWS to reject the request with `SignatureDoesNotMatch`.

### Fix

**File: `src/lib/s3Storage.ts`** — Remove the `Content-Type` header from the PUT request so only the signed headers are sent:

```ts
// Before
const res = await fetch(url, {
  method: "PUT",
  body: file,
  headers: {
    "Content-Type": (file as File).type || "application/octet-stream",
  },
});

// After
const res = await fetch(url, {
  method: "PUT",
  body: file,
});
```

S3 will infer the content type, and the signature will match since no extra headers are injected.

### Scope
One line change in one file. No edge function or VPS changes needed.

