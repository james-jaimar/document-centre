## Plan

1. **Restore deployment startup**
   - Update `pdf-server/app/tasks/cloudprinter_tasks.py` so it no longer imports removed module-level `s3_client` / `S3_BUCKET` from `app.services.storage`.
   - Use the existing lazy `StorageService` / configured S3 client path instead, so credentials are resolved at task runtime rather than import time.

2. **Keep CloudPrinter behaviour unchanged**
   - Preserve the existing ZIP creation, S3 object key, callback payload, MD5 calculation, and presigned URL behaviour.
   - Only change how the task obtains the S3 client and bucket.

3. **Add a compatibility guard if needed**
   - If `StorageService` does not expose presigned URL generation cleanly, add a small explicit helper in `cloudprinter_tasks.py` using `_build_s3_client` and `settings.aws_s3_bucket`, avoiding reintroducing import-time S3 clients.

4. **Validate the fix locally**
   - Run a Python import check for `app.main` / `app.web.routes` from `pdf-server` to confirm the container startup import path no longer fails.
   - Search for any remaining `s3_client` / `S3_BUCKET` imports so this exact failure cannot recur.

This is a narrow hotfix for the deployment failure; it will not touch the rendering pipeline changes unless the import repair requires it.