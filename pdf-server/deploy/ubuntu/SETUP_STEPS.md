# Ubuntu native setup

1. SSH into the VPS as a sudo user.
2. Install the Ubuntu packages:
   - `sudo bash scripts/install-ubuntu.sh`
3. Copy the repo into `/opt/document-centre-api`.
4. In `/opt/document-centre-api`, copy `.env.example` to `.env` and fill it in.
5. Run:
   - `sudo bash scripts/bootstrap-app.sh`
6. Install systemd units:
   - `sudo cp deploy/systemd/document-centre-api.service /etc/systemd/system/`
   - `sudo cp deploy/systemd/document-centre-worker.service /etc/systemd/system/`
7. Reload systemd and start services:
   - `sudo systemctl daemon-reload`
   - `sudo systemctl enable --now document-centre-api document-centre-worker`
8. Install Nginx site:
   - `sudo cp deploy/nginx/document-centre-api.conf /etc/nginx/sites-available/document-centre-api.conf`
   - edit `server_name`
   - `sudo ln -s /etc/nginx/sites-available/document-centre-api.conf /etc/nginx/sites-enabled/document-centre-api.conf`
   - `sudo nginx -t && sudo systemctl reload nginx`
9. Point your domain/subdomain at the VPS.
10. Add SSL with Certbot when DNS is live.
11. Run the SQL in `supabase/migrations/001_init.sql` inside Supabase.
12. Check:
    - `curl http://127.0.0.1:8000/health`
    - `sudo systemctl status document-centre-api`
    - `sudo systemctl status document-centre-worker`

---

## Upgrading to Ops & Control API (2026-04-24)

This release adds live system metrics, queue control, worker control,
storage analytics, an audit log, and an SSE event stream — all consumed
by the React admin UI under `/platform/document-centre`.

### What changes on the box

- 3 new Python deps: `psutil`, `sse-starlette`, `boto3`
- 2 new tables: `ops_audit_log`, `ops_storage_snapshots`
- 2 new columns on `job_events`: `tenant_id`, `app_id`
- 1 new systemd unit: `document-centre-beat` (Celery Beat scheduler)
- Updated Nginx site (adds an SSE-friendly `location /v1/ops/events/` block)

### Install steps

```bash
ssh you@vps
cd /opt/document-centre-api
git pull
sudo bash scripts/install-ops-api.sh
```

The installer is idempotent and handles everything:
1. Installs Python deps from `requirements.txt`
2. Runs `migrations/2026_04_24_ops_api.sql` against your DB
3. Installs `document-centre-beat.service`
4. Updates the Nginx site (preserves your existing `server_name`)
5. Reloads systemd + nginx, restarts api/worker, enables beat
6. Smoke-tests `/health`, `/v1/ops/health`, `/v1/ops/system`

### Verify

```bash
sudo systemctl status document-centre-api document-centre-worker document-centre-beat
curl -s http://127.0.0.1:8000/v1/ops/health | jq
curl -s http://127.0.0.1:8000/v1/ops/system | jq '.cpu, .memory'
curl -s http://127.0.0.1:8000/v1/ops/queues | jq
```

Then open the React admin UI at `/platform/document-centre` — every
tab (Overview, Queues, Workers, Storage, Jobs, Assets, Metrics,
Audit, Config) should populate with live data.

### Troubleshooting

- **SSE stream looks frozen in the UI**
  Check the active Nginx config contains `location /v1/ops/events/`
  with `proxy_buffering off`:
  ```
  sudo grep -A5 'ops/events' /etc/nginx/sites-enabled/document-centre-api.conf
  ```

- **Scheduled tasks (storage snapshot, tmp cleanup) not firing**
  ```
  sudo systemctl status document-centre-beat
  sudo journalctl -u document-centre-beat -f
  ```

- **`/v1/ops/queues` shows zero workers**
  The worker service must be running and on the same Redis broker:
  ```
  sudo systemctl status document-centre-worker
  redis-cli ping
  ```

- **psql migration fails with "permission denied"**
  The role in `DATABASE_URL` must own (or have CREATE on) the schema.
  Confirm by connecting manually: `psql "$DATABASE_URL"`

- **Re-running the installer**
  Safe — every step is idempotent. Use it any time you `git pull`
  changes that touch ops API code, deps, or systemd units.

---

## Upgrading to split heavy/light workers (2026-04-29)

Replaces the legacy single-pool `document-centre-worker.service` (queues
`default,documents,thumbnails,imposition,pdf`, concurrency 4) with two
specialised units:

| Unit | Queues | Concurrency |
|------|--------|-------------|
| `document-centre-worker-heavy` | documents, imposition, pdf | 2 |
| `document-centre-worker-light` | default, thumbnails | 4 |

Run on the box:

```bash
ssh you@vps
cd /opt/document-centre-api && git pull
sudo bash scripts/migrate-to-split-workers.sh
```

The script is idempotent: it disables the legacy unit, installs both new
unit files from `deploy/systemd/`, reloads systemd, and starts them.

### Verify both workers are alive

```bash
sudo systemctl status document-centre-worker-heavy document-centre-worker-light
.venv/bin/celery -A app.worker.celery_app inspect active_queues
```

The `inspect` output must list **two** nodes — `heavy@<host>` and
`light@<host>`. If only one shows up, check the journal:

```bash
sudo journalctl -u document-centre-worker-heavy -n 100
sudo journalctl -u document-centre-worker-light  -n 100
```

You can also confirm via the database — every new `job_events.worker_name`
should be either `heavy@…` or `light@…`, never `celery@…`:

```sql
SELECT worker_name, COUNT(*) FROM job_events
WHERE started_at > now() - interval '1 hour'
GROUP BY worker_name;
```

### Optional: tune in-process render parallelism

`generate_previews` now runs a **CPU pool** (rasterize + downscale) and an
**IO pool** (S3 upload) in parallel. Defaults are auto-sized for the box
but can be overridden in `/opt/document-centre-api/.env`:

```
RENDER_CPU_CONCURRENCY=3   # default: max(1, cpu_count - 1)
RENDER_IO_CONCURRENCY=8    # default: 8
```

After changing, restart both worker units.
