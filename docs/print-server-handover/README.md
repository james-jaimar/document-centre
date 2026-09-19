# Print server + Cape Town storage — handover pack

This folder lets another Lovable app use the same PDF/print engine and the same
Cape Town file storage that Document Centre uses.

Upload this whole folder into the other app and tell its assistant:

> Read `README.md`, then `01-settings-checklist.md`, then copy the two functions
> in `functions/` into `supabase/functions/`. Follow `02-how-to-call.md` for the
> actual job flow. Do not change the storage prefix guard.

## What the other app gets

| Service | Address | Notes |
|---|---|---|
| Print server | `https://api.document-centre.com` | FastAPI on Google Cloud Run, `africa-south1`. Convert, rasterise, impose, merge, preview, CMYK. |
| File storage | AWS S3, region `af-south-1` (Cape Town) | Shared bucket, one dedicated top-level folder per app. |

## Two rules that must not be broken

1. **Never call the print server from the browser.** It has no key check of its
   own — it is reachable only through the load balancer, and every caller is
   trusted. All calls go through the `pdf-api` edge function in `functions/`,
   which checks the caller's login first.
2. **Never write outside your own folder in the bucket.** The `s3-storage`
   function in `functions/` refuses any path that is not under
   `APP_STORAGE_PREFIX`. Document Centre's files live alongside yours.

## Contents

```
README.md                     this file
01-settings-checklist.md      every setting to add, and where the value comes from
02-how-to-call.md             upload → register asset → run job → poll → download
03-aws-scoped-key.md          optional: a separate AWS key locked to your folder
functions/pdf-api/index.ts    gatekeeper in front of the print server
functions/s3-storage/index.ts storage helper with the folder guard
functions/_shared/s3Delete.ts delete helper (the gateway cannot delete)
```

## Job tagging

Every call the gatekeeper makes sends `X-Ops-App-Id` set to your app's slug, so
the Document Centre platform screens can show and filter which app produced each
job. Set `OPS_APP_ID` (see the checklist) — do not leave it blank.
