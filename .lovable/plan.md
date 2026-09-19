# Handover pack: let another app use the print server and Cape Town storage

## What you're handing over

Two shared services, both already running for Document Centre:

- **Print server** — `https://api.document-centre.com`, hosted in Google Cloud's
  Johannesburg/Cape Town region. It takes files, converts and renders them, and
  returns print-ready output.
- **File storage** — the Cape Town S3 bucket (region `af-south-1`) where uploads
  and rendered output live.

Important finding: the print server itself has **no password or key check**. It is
only shielded by being unreachable except through the front door. So the other app
must never be given the raw address to call from a browser — it gets its own copy
of the small gatekeeper that sits in front of it, exactly like this app has.

## Plan

1. **Build a handover pack** (a folder of files you can upload into the other
   Lovable app) containing:
   - A copy of the gatekeeper (`pdf-api` proxy) with Document-Centre-specific bits
     removed, ready to drop into the other app.
   - A copy of the storage helper (`s3-storage` proxy) with the shared-bucket
     folder rule baked in.
   - A short "how to call it" guide: uploading a file, starting a job, polling for
     the result, downloading output.
   - A checklist of the settings the other app must add on its side, with where
     each value comes from.

2. **Shared bucket, separate folder.** The other app writes only under its own
   top-level folder in the bucket (for example `gasa/`). The copied storage helper
   enforces that prefix so it cannot read or write Document Centre's files by
   accident.

3. **Tag every job with the app that created it.** The gatekeeper already forwards
   an app identifier to the print server; the pack sets it to the new app's name,
   and the platform job screens here gain an "App" column plus a filter so you can
   tell the two workloads apart.

4. **Tell you where the keys live and which to copy.** No secret values go into any
   file — the pack names them and you paste the values into the other app's secure
   settings.

## Settings the other app will need

| Name | What it is | Where to get it |
|---|---|---|
| `DOCUMENT_CENTRE_API_URL` | Print server address | Already saved here under the same name |
| `AWS_S3_BUCKET` | Cape Town bucket name | Saved here under the same name |
| `AWS_S3_REGION` | `af-south-1` | Saved here |
| `AWS_S3_ACCESS_KEY_ID` / `AWS_S3_SECRET_ACCESS_KEY` | Storage credentials | Saved here; copy the same values, or issue a new AWS user limited to the new folder (recommended) |
| `APP_STORAGE_PREFIX` | The new app's folder, e.g. `gasa/` | You choose it |

The other app can alternatively connect AWS S3 through its own workspace
connection using the same credentials — the pack covers both routes.

## Technical notes

- Pack authored to `/mnt/documents/print-server-handover/` and mirrored into
  `docs/print-server-handover/` for GitHub sync.
- Proxy copy derived from `supabase/functions/pdf-api/index.ts`: keeps the JWT
  decode, the `ALLOWED_PREFIXES` allowlist and the traceback-wrapping error path;
  drops the `user_roles`/`platform_admin` ops gate (the new app defines its own
  admin check) and pins `X-Ops-App-Id` to the new app's slug.
- Storage copy derived from `supabase/functions/s3-storage/index.ts` with a
  mandatory prefix guard on every `object_path` before signing.
- Print-server side is unchanged: `X-Ops-App-Id` is already read and recorded on
  `JobEvent`/ops audit rows.
- This project's only code change: an App column + filter on
  `src/pages/platform/PlatformDocumentCentreJobs.tsx`, sourced from the existing
  job `app_id`.
- No credential values are written to any file; secrets are referenced by name.

## Recommendation

Issue a **separate AWS access key** scoped to the new app's folder rather than
sharing Document Centre's key. If you want that, say so and the pack will include
the exact policy to paste into AWS.
