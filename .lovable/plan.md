## What is actually failing now

The current error is no longer the Cloud Tasks enqueue/IAM problem. The inspect job is being created and run, then failing inside the worker when it tries to read the uploaded PDF from S3:

```text
pdf-server/app/tasks/document_tasks.py:239 -> storage.download(...)
pdf-server/app/services/storage.py:96 -> boto3 download_fileobj(...)
botocore.exceptions.ClientError: 403 HeadObject Forbidden
```

So the issue is: **the Cloud Run PDF runtime can’t `HeadObject/GetObject` the S3 object that the browser successfully uploaded.**

Most likely cause: the frontend upload signer (`supabase/functions/s3-storage`) and the Cloud Run PDF server (`PDF_AWS_*` secrets in GCP Secret Manager) are not using the same working S3 permissions, bucket, region, or object-prefix policy.

## Plan

### 1. Verify the live S3 configuration used by both sides

Check these are aligned:

- Supabase `s3-storage` connection used for upload signing
- GCP Secret Manager values mounted into Cloud Run:
  - `PDF_STORAGE_MODE=s3`
  - `PDF_AWS_S3_BUCKET`
  - `PDF_AWS_S3_REGION`
  - `PDF_AWS_ACCESS_KEY_ID`
  - `PDF_AWS_SECRET_ACCESS_KEY`

Expected bucket from the current code/docs is:

```text
jaimar-dev-600743178200-af-south-1-an
```

Expected object key that failed:

```text
tenants/72347b5f-ca94-4e25-9235-5bd2e554beeb/uploads/16602492-a84e-414b-af5c-c6a0d86e2bc9/469ed46d-0876-46a8-9e2c-c7f99beb4586/8pp_A4.pdf
```

### 2. Fix AWS IAM/S3 permissions for the Cloud Run PDF key

The IAM user/access key stored in `PDF_AWS_ACCESS_KEY_ID` must allow at least:

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject",
    "s3:DeleteObject"
  ],
  "Resource": "arn:aws:s3:::jaimar-dev-600743178200-af-south-1-an/*"
}
```

And if the policy is scoped by prefix, it must include:

```text
tenants/*
```

If the bucket policy has any explicit deny conditions, confirm they do not block the Cloud Run key/user.

### 3. Update GCP Secret Manager if the Cloud Run key is wrong/stale

If the AWS key in GCP is not the same key that can read the uploaded objects, add a new secret version for:

- `PDF_AWS_ACCESS_KEY_ID`
- `PDF_AWS_SECRET_ACCESS_KEY`
- and, if needed, `PDF_AWS_S3_BUCKET` / `PDF_AWS_S3_REGION`

Then redeploy or update the Cloud Run services so `pdf-api`, `pdf-worker-heavy`, and `pdf-worker-light` all pick up the latest secret versions.

### 4. Add a small runtime S3 diagnostic to prevent blind debugging next time

Implement a safe internal diagnostic in the PDF server that reports only non-secret facts:

- storage mode
- bucket name
- region
- caller/access-key fingerprint only, not the secret
- whether `HeadObject` succeeds for a supplied key
- clear classification: missing object vs permission denied vs wrong region/bucket

This should be admin/internal only and must not expose credentials.

### 5. Improve error reporting for future upload failures

Change the worker’s storage download failure handling so job errors say something actionable like:

```text
S3 read failed: permission denied for bucket=<bucket>, key=<key>. Check PDF_AWS_* credentials and bucket policy.
```

instead of surfacing raw `botocore` tracebacks to the customer upload UI.

### 6. Validate end-to-end

After the permissions/secrets are corrected:

1. Upload the same PDF again.
2. Confirm `POST /v1/assets` succeeds.
3. Confirm `POST /v1/assets/{id}/inspect` creates the job.
4. Confirm the job reaches `completed`, not `failed`.
5. Confirm thumbnails/previews continue without S3 read/write errors.

## Technical notes

- Cloud Tasks appears to be delivering now; otherwise the job would stay queued or `/inspect` would 500 during enqueue.
- The current failure is specifically S3 `HeadObject`, which has the same permission requirements as object read access.
- AWS documentation confirms S3 `403 Forbidden` means access is explicitly or implicitly denied, and Boto3 `head_object` behaves like a metadata-only object read.