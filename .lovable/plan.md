# PDF server handover for the two other projects

## What exists today (verified in this repo)

**Where it runs** — Google Cloud Run, project `project-59a14b18-b4df-4c6b-b09`, compute region `africa-south1`, Cloud Tasks/Scheduler in `europe-west1`. Four services from one image (`ROLE` env var dispatches):

| Service | CPU/RAM | Conc. | min/max | Purpose |
|---|---|---|---|---|
| `pdf-api` | 1 / 1Gi | 80 | 0 / 10 | FastAPI, the only public one |
| `pdf-worker-heavy` | 2 / 4Gi | 2 | 0 / 5 | LibreOffice, imposition |
| `pdf-worker-light` | 4 / 4Gi | 4 | 0 / 32 | preview/render fan-out |
| `pdf-worker-emails` | 1 / 512Mi | 8 | 1 / 10 | SMTP/Graph/Gmail outbound |

Workers are `--no-allow-unauthenticated` and only reachable by the `cloud-tasks-invoker` service account. Queues: `documents-heavy`, `documents-light`, `emails-default`, `emails-control`. Cloud Scheduler replaces Celery beat (storage snapshot, tmp cleanup, email outbox scan, stuck-email release).

**Public entry point** — `https://api.document-centre.com` (global external HTTPS LB → serverless NEG → `pdf-api`; Cloud Run domain mapping is unavailable in africa-south1). Health/version facts at `GET /health`.

**API surface** — everything under `/v1`:
- Assets: `POST /v1/assets` (registers a storage path, runs an inline pikepdf probe returning page_count / width_pt / height_pt / boxes / mixed_orientation), `GET /v1/assets/{id}`, `/derived-files`, `/events`, `POST /v1/assets/{id}/inspect`, `/render-pages`, `/cancel-jobs`
- Jobs: `GET /v1/jobs`, `GET /v1/jobs/{id}`, `POST /v1/jobs/{id}/cancel`
- Operations: `rotate`, `grayscale`, `cmyk`, `resize`, `nup`, `impose-sheet`, `booklet`, `merge`, `crop-rasterize`, `generate-previews`, `convert-office`, `normalize-orientation`, `print-ready`, `prepare-for-product`, `pad-pages`, `assemble-print-ready`, `assemble-imposed-sheet`, `render-job-ticket`
- Ops/admin: `/v1/ops/*`, `/admin` (basic-auth console), `/diagnostics`

**Toolchain in the image** — LibreOffice (office → PDF), Ghostscript, qpdf, pdfcpu, MuPDF/mutool, pikepdf, Pillow, ICC profiles for CMYK.

**Storage model** — the client uploads the file itself, then hands the server a `source_storage_path`. Server reads/writes via one shared S3 bucket (`AWS_S3_BUCKET`, `af-south-1`, `STORAGE_MODE=s3`); Supabase Storage is also supported. Job/asset metadata lives in one Postgres DB (`DATABASE_URL`).

## Two gaps that block the requested setup

1. **`/v1/*` has no authentication.** `pdf-api` is deployed `--allow-unauthenticated` and no route depends on `API_AUTH_TOKEN` (only the Cloudprinter webhook checks a bearer). Today anything on the internet can POST to it. A shared server-to-server token must be added before other projects use it.
2. **No storage isolation.** Any caller can name any S3 key, so project A could read project B's artefacts.

## Plan

### 1. Shared-token auth on `pdf-api`
- Add a FastAPI dependency on the `/v1` router that requires `Authorization: Bearer <token>`.
- Tokens are multi-tenant: a `CLIENT_TOKENS` secret holding `{"document-centre": "...", "project-b": "...", "project-c": "..."}` (JSON in Secret Manager), resolved to a `client_id` on each request.
- Exempt `/health`, `/admin`, Cloud Tasks and beat routes (already SA-protected).
- Rotate by editing the secret + redeploying `pdf-api`.

### 2. Storage isolation by client prefix
- Each client gets a mandatory S3 key prefix (`clients/{client_id}/...`), stored alongside the token.
- Reject any request whose `source_storage_path` / output paths fall outside the caller's prefix (403).
- Derived files and previews are written under the same prefix.
- Persist `client_id` on `assets` and `jobs`, and scope `GET /v1/assets/{id}`, `/jobs` to the caller's `client_id`.

### 3. Generate the two client tokens
- Mint two tokens, add them to Secret Manager, and note them for the other projects.

### 4. Integration notes to hand over
Short reference for the other teams: base URL, bearer header, upload-then-register flow, the operation list, polling `GET /v1/jobs/{id}` until `status=done`, cold-start expectations (~8–12s on `pdf-api` at min-instances=0), 200MB practical file cap, and the fact that they must write uploads into their own prefix.

## Technical notes
- Code touched: `pdf-server/app/main.py`, `pdf-server/app/web/routes.py`, a new `pdf-server/app/core/auth.py`, `pdf-server/app/core/config.py`, plus a small migration adding `client_id` to assets/jobs.
- Deploy: `.github/workflows/pdf-server-deploy.yml` runs on push to `main`; the new secret is wired via `pdf-server/docker/secrets-bootstrap.sh`.
- This project's own calls go through the `pdf-api` Supabase edge function, which will need the same bearer header added — no frontend change.
