# Document Centre API

Backend for ecommerce document printing with native Ubuntu deployment support.

## What it does

- Accepts uploaded assets already stored in Supabase Storage or local storage
- Converts office files to PDF
- Converts images to PDF
- Inspects PDF page sizes and boxes
- Normalizes/fixes PDFs with qpdf/Ghostscript where possible
- Generates thumbnails and previews
- Merges PDFs
- Rotates PDFs
- Converts PDFs to grayscale
- Converts PDFs to CMYK
- Resizes/crops pages
- Performs basic N-up, sheet imposition with bleed/crop marks, and booklet jobs
- Runs heavy work through a queue
- Includes a simple admin UI for retry/cancel/delete/reset of jobs

## Recommended production shape

For now, this repo is best run on a plain Ubuntu VPS with:

- Ubuntu
- Python virtualenv
- Redis installed directly on the server
- FastAPI API run by systemd
- Celery worker run by systemd
- Nginx as reverse proxy
- Supabase Postgres for the database
- Supabase Storage for uploaded/generated files

## Native Ubuntu deployment

Important files:

- `scripts/install-ubuntu.sh` — installs Ubuntu packages you need
- `scripts/bootstrap-app.sh` — creates the venv and installs Python dependencies
- `deploy/systemd/document-centre-api.service` — API service unit
- `deploy/systemd/document-centre-worker.service` — worker service unit
- `deploy/nginx/document-centre-api.conf` — Nginx site config
- `deploy/ubuntu/ENV_CHECKLIST.md` — what to put in `.env`
- `deploy/ubuntu/SETUP_STEPS.md` — plain-English Ubuntu steps

### Quick setup outline

1. Create a fresh Ubuntu VPS.
2. Clone or copy this repo to `/opt/document-centre-api`.
3. Copy `.env.example` to `.env` and fill in real values.
4. Run `sudo bash scripts/install-ubuntu.sh`
5. Run `sudo bash scripts/bootstrap-app.sh`
6. Install the systemd and Nginx files from `deploy/`
7. Start the API and worker services
8. Point your domain to Nginx
9. Run `supabase/migrations/001_init.sql` in Supabase

## Local/Docker use

Docker files are still included for local development and experimentation, but Docker/Coolify is no longer the primary deployment path in this repo.

## Frontend flow

See `LOVABLE_API_FLOW.md` for the upload → process → preview → impose flow.

## Current milestone focus

Milestone 1 is:

- upload/reference file
- normalize to PDF
- inspect page sizes/boxes
- generate thumbnails/previews
- track derived files

## Notes

This is a strong working base, not finished pressroom software.

Advanced booklet/signature logic, deeper preflight, and print-tuned grayscale policies still need testing and iteration.
