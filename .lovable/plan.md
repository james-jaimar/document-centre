# Fix S3 presigned URL region for Cloudprinter renders

## Problem
The module-level `s3_client` in `pdf-server/app/services/storage.py` is built without an explicit endpoint or SigV4 config. Because the bucket `jaimar-dev-600743178200-af-south-1-an` lives in `af-south-1` (an opt-in region), the presigned URLs it generates target the global S3 endpoint and fail with `IllegalLocationConstraintException` when Cloudprinter fetches them.

## Change
Single, surgical edit to `pdf-server/app/services/storage.py`:

- Add `from botocore.config import Config` to the imports.
- Replace the existing `s3_client = boto3.client('s3', region_name='af-south-1')` with:

```python
s3_client = boto3.client(
    's3',
    region_name='af-south-1',
    endpoint_url='https://s3.af-south-1.amazonaws.com',
    config=Config(signature_version='s3v4', s3={'addressing_style': 'virtual'}),
)
```

Nothing else changes:
- `S3_BUCKET` constant untouched.
- `StorageService` class and its internal `self._s3` client untouched.
- No task / route / schema changes.

## Verify after `git pull` + restart
1. Restart `document-centre-api` and `document-centre-worker-light` on the VPS.
2. Trigger a Cloudprinter render (or call `s3_client.generate_presigned_url(...)` from a shell) and confirm the URL host is `jaimar-dev-600743178200-af-south-1-an.s3.af-south-1.amazonaws.com` (virtual-hosted, regional).
3. Confirm Cloudprinter download no longer returns `IllegalLocationConstraintException`.
