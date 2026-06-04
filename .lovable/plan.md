# Phase 1 cleanups — S3 is the only storage path

Small, surgical edits. No behavioural change for the running VPS (it sets these env vars explicitly); only affects defaults and the Cloud Run bootstrap UX.

## 1. `pdf-server/app/core/config.py`

- Change `storage_mode` default from `'supabase'` to `'s3'`.
- Change `supabase_storage_bucket` default from `'documents'` to `''` (no longer a meaningful default).
- Leave the `supabase_*` fields in place for now — `storage.py` still imports `create_client` at module load. Removing the Supabase code path is out of scope for this cleanup (separate task).
- Remove the duplicate `settings = Settings()` line at the bottom of the file (currently declared twice).

## 2. `pdf-server/docker/secrets-bootstrap.sh`

- Move `PDF_SUPABASE_STORAGE_BUCKET` out of `REQUIRED` — it is unused in S3 mode.
- Move S3 secrets into `REQUIRED` (these ARE required now):
  - `PDF_STORAGE_MODE` (must be `s3`)
  - `PDF_AWS_S3_BUCKET`
  - `PDF_AWS_S3_REGION`
  - `PDF_AWS_ACCESS_KEY_ID`
  - `PDF_AWS_SECRET_ACCESS_KEY`
- Keep these in `OPTIONAL`:
  - `PDF_SUPABASE_STORAGE_BUCKET` (legacy, harmless)
  - `PDF_ADMIN_USERNAME`, `PDF_ADMIN_PASSWORD`
- Rewrite the header comment block: drop "Supabase storage" framing; describe storage as S3-only with Supabase Postgres + Storage retained only for DB and (legacy) signed-URL fallbacks.
- Note in the comment that `PDF_SUPABASE_URL` / `PDF_SUPABASE_SERVICE_ROLE_KEY` remain required because the app still uses the Supabase client for DB-adjacent calls (not storage).

## 3. `.lovable/plan.md`

- Under Phase 1 → Code changes, add a bullet documenting the default flip (`STORAGE_MODE=s3`) and the secrets-bootstrap reshuffle.
- Under "Manual steps for you" step 1, replace the Supabase-storage-pooler-only callout with: required values now include the S3 credentials block; pooler note for `PDF_DATABASE_URL` stays.
- Under "Notes / gotchas", add: "Storage is S3-only (`af-south-1`). The `supabase` branch in `storage.py` is dead and slated for removal in a follow-up."

## 4. (Not in scope, but flagged for a follow-up task)

`pdf-server/app/services/storage.py` still:
- Imports `boto3` twice (once guarded, once unguarded).
- Constructs a module-level `s3_client` with hardcoded bucket/region, bypassing `settings`.
- Keeps a full Supabase storage branch that is now unreachable in production.

Worth a dedicated cleanup PR — not bundled into this one to keep the diff reviewable.

## Exit criteria

- `bash pdf-server/docker/secrets-bootstrap.sh` prompts for the correct required set on a fresh GCP project (S3 creds in, Supabase storage bucket out of required).
- `config.py` default boot mode is `s3`; no second `Settings()` instantiation.
- Plan doc reflects S3-only reality.
- No code path changes for the live VPS (env vars there are explicit).
