# PDF Server (document-centre-api)

Source-of-truth backup for the FastAPI + Celery PDF processing service that runs at
**`document-centre-api.jaimar.dev`**. The live service is deployed on its own VPS;
this folder exists so the code lives alongside the Lovable client that consumes it,
and so the AI assistant in this repo can read both sides of the contract in one place.

> ⚠️ **Lovable does not build or run this folder.** It only builds the React/Vite app
> at the repo root. These files are reference + backup only.

---

## What this service does

- Accepts uploaded assets (PDFs, images, Office documents) via S3.
- Runs operations on them via Celery workers: `inspect`, `rotate`, `grayscale`, `cmyk`,
  `resize`, `nup`, `impose-sheet`, `booklet`, `merge`, `crop-rasterize`,
  `convert-office` (LibreOffice headless).
- Produces normalized PDFs, thumbnails, previews, and derived files; writes them back to S3.
- Exposes a REST API documented at `/openapi.json` on the live host.

The contract consumed by the Lovable client lives at:
[`docs/document-centre-api-contract.md`](../docs/document-centre-api-contract.md)

Keep that file and this server in sync — if you change a route here, update the contract.

---

## Suggested layout

```text
pdf-server/
├── README.md                  ← this file
├── .gitignore
├── .env.example               ← template; never commit real .env
├── requirements.txt           ← or pyproject.toml
├── Dockerfile
├── docker-compose.yml         ← optional: api + worker + redis
├── app/
│   ├── main.py                ← FastAPI app entry
│   ├── config.py              ← settings (S3, DB, Redis, etc.)
│   ├── routes/
│   │   ├── assets.py
│   │   ├── jobs.py
│   │   └── operations.py      ← /v1/operations/* incl. convert-office
│   ├── workers/
│   │   ├── celery_app.py
│   │   ├── inspect.py
│   │   ├── render.py
│   │   └── office.py          ← LibreOffice conversion task
│   ├── services/
│   │   ├── s3.py
│   │   └── assets.py
│   └── models/
└── deploy/
    ├── systemd/               ← .service unit files
    ├── nginx/                 ← reverse-proxy config
    └── scripts/               ← deploy.sh, restart.sh, etc.
```

Adjust to match what's actually on the VPS — this is a suggestion, not a mandate.

---

## How to copy your working code in

On the VPS (or wherever the working source lives):

```bash
# 1. Clone this repo somewhere local
git clone <this-repo-url> document-centre
cd document-centre

# 2. Copy the server source in
cp -R /path/to/your/pdf-server/* pdf-server/

# 3. Strip secrets / venv / caches (see .gitignore — these should be excluded already)
rm -rf pdf-server/.venv pdf-server/__pycache__ pdf-server/.env

# 4. Commit + push
git add pdf-server/
git commit -m "chore(pdf-server): import working source for backup + reference"
git push
```

Lovable will sync the new files into the project filesystem automatically.

---

## What MUST NOT be committed

- `.env` files containing real S3 keys, DB passwords, SMTP creds, signing secrets.
  Use `.env.example` with placeholder values instead.
- Virtualenvs (`.venv/`, `venv/`, `env/`).
- Python bytecode (`__pycache__/`, `*.pyc`).
- Large binary artifacts: built PDFs, sample uploads, model files, log dumps.
- IDE files (`.idea/`, `.vscode/` — keep workspace-specific).

The included `.gitignore` covers these. Double-check before the first push.

---

## Operational notes (for future-you)

- **LibreOffice concurrency**: each `soffice --headless` invocation must use a unique
  `-env:UserInstallation=file:///tmp/lo-<uuid>` profile path, otherwise parallel jobs
  collide on the user-profile lock and one will hang. Recommend Celery `-c 2` for the
  `office` queue on small VPSes.
- **Fonts**: install `fonts-liberation` and `fonts-dejavu` (or your corporate font set)
  on the host so converted documents render correctly.
- **Worker HOME**: the Celery service's `HOME` must be writable (LibreOffice writes a
  profile on first run). In systemd, set `Environment=HOME=/var/lib/document-centre`
  and ensure that directory is owned by the service user.
- **Asset promotion**: after a successful `convert-office` job, the worker MUST update
  the asset's `normalized_storage_path` to the new PDF and recompute `page_count`,
  `width_pt`, `height_pt`, `boxes` — otherwise the Lovable client will keep treating
  the original .docx as the source of truth.

---

## Related

- Live API: <https://document-centre-api.jaimar.dev/openapi.json>
- Client contract: [`../docs/document-centre-api-contract.md`](../docs/document-centre-api-contract.md)
- Client wrapper: [`../src/lib/documentCentreApi.ts`](../src/lib/documentCentreApi.ts)
- Edge proxy: [`../supabase/functions/pdf-api/index.ts`](../supabase/functions/pdf-api/index.ts)
