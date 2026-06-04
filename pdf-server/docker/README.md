# pdf-server Docker + GCP deployment

This directory holds everything needed to run the PDF stack as a container
on Google Cloud Run.

## Files

| File              | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `MANIFEST.md`     | Frozen snapshot of the live VPS — Dockerfile pins to it  |
| `gcp-setup.sh`    | One-shot bootstrap for the `document-centre-prod-dc` GCP project |
| `../Dockerfile`   | Multi-stage, single image, role-dispatched at runtime    |
| `../scripts/entrypoint.sh` | Dispatches on `$ROLE` (api / worker-heavy / worker-light / worker-emails / beat) |
| `../scripts/audit-vps.sh`  | Capture the live VPS → regenerate MANIFEST.md  |
| `../scripts/check-dockerfile-drift.sh` | Pre-push guard against requirements/install drift |

## Workflow

### One-time

1. **Audit the VPS** to populate the manifest:
   ```bash
   ssh root@<vps-host> 'bash -s' < pdf-server/scripts/audit-vps.sh \
     > pdf-server/docker/MANIFEST.md
   git add pdf-server/docker/MANIFEST.md && git commit -m "Capture VPS manifest"
   ```

2. **Bootstrap GCP** in Cloud Shell (https://shell.cloud.google.com):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/james-jaimar/document-centre/main/pdf-server/docker/gcp-setup.sh \
     | bash
   ```
   …or paste the script contents directly. Idempotent.

### Every push to `main`

`.github/workflows/pdf-server-deploy.yml` runs automatically:
- Authenticates to GCP via Workload Identity Federation (no JSON keys)
- Builds the image and pushes to `africa-south1-docker.pkg.dev/...`
- Deploys 3 Cloud Run services (`pdf-api`, `pdf-worker-heavy`, `pdf-worker-light`)

### Rollback

GitHub → Actions → "Deploy pdf-server to Cloud Run" → Run workflow → paste
the SHA you want to redeploy in `rollback_sha`.

## Local testing

```bash
# Build
docker build -f pdf-server/Dockerfile -t dc-pdf:dev .

# Run API
docker run --rm -p 8000:8000 -e ROLE=api dc-pdf:dev
curl http://localhost:8000/health

# Run a worker (needs Redis reachable via CELERY_BROKER_URL)
docker run --rm -e ROLE=worker-light -e CELERY_BROKER_URL=redis://host.docker.internal:6379/0 dc-pdf:dev
```

## Cloud Run service shapes

| Service           | CPU | RAM  | Concurrency | min/max instances | Public? |
| ----------------- | --- | ---- | ----------- | ----------------- | ------- |
| `pdf-api`         | 1   | 1Gi  | 80          | 0 / 10            | Yes     |
| `pdf-worker-heavy`| 2   | 4Gi  | 1           | 0 / 5             | No      |
| `pdf-worker-light`| 1   | 2Gi  | 8           | 0 / 10            | No      |

Workers stay at `min-instances=0` to keep idle cost at £0. Phase 5 may bump
`pdf-api` to `min-instances=1` once we know the traffic shape, to eliminate
the ~8-12s cold-start on the user-facing path.
