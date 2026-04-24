# VPS Install Package — Document Centre Ops & Control API

Approved. In default mode I'll create exactly 5 files. After that, your VPS install is `git pull && sudo bash scripts/install-ops-api.sh`.

## Files to create

### 1. `pdf-server/migrations/2026_04_24_ops_api.sql`
Idempotent SQL migration:
- `CREATE TABLE IF NOT EXISTS ops_audit_log` — actor, action, target, payload, result, created_at + indexes on actor/created_at/action
- `CREATE TABLE IF NOT EXISTS ops_storage_snapshots` — captured_at, s3_object_count, s3_bytes, disk_used_bytes, disk_free_bytes, payload jsonb + index on captured_at
- `ALTER TABLE job_events ADD COLUMN IF NOT EXISTS tenant_id uuid` + index
- `ALTER TABLE job_events ADD COLUMN IF NOT EXISTS app_id uuid` + index

### 2. `pdf-server/deploy/systemd/document-centre-beat.service`
Dedicated Celery Beat unit (separate from worker so we don't double-fire scheduled tasks if workers ever scale to N>1):
- ExecStart: `.venv/bin/celery -A app.worker.celery_app beat -l info --schedule=/opt/document-centre-api/tmp/celerybeat-schedule`
- After redis-server, Restart=always, EnvironmentFile=`.env`

### 3. `pdf-server/deploy/nginx/document-centre-api.conf` (replace existing)
Same as current + a dedicated `location /v1/ops/events/` block:
- `proxy_buffering off;`
- `proxy_cache off;`
- `proxy_read_timeout 24h;`
- `chunked_transfer_encoding on;`
- `add_header X-Accel-Buffering no;`

This is required for the SSE stream (`/v1/ops/events/stream`) to flush events live instead of buffering.

### 4. `pdf-server/scripts/install-ops-api.sh`
One-shot upgrade script (idempotent, safe to re-run):
1. Verify running as root, cd into `/opt/document-centre-api`
2. Activate venv, `pip install -r requirements.txt` (picks up psutil, sse-starlette, boto3)
3. Run migration: `psql "$DATABASE_URL" -f migrations/2026_04_24_ops_api.sql`
4. Copy `deploy/systemd/document-centre-beat.service` → `/etc/systemd/system/`
5. Copy updated `deploy/nginx/document-centre-api.conf` → `/etc/nginx/sites-available/`
6. `nginx -t && systemctl reload nginx`
7. `systemctl daemon-reload`
8. `systemctl enable --now document-centre-beat`
9. `systemctl restart document-centre-api document-centre-worker`
10. Smoke-test: `curl -fsS http://127.0.0.1:8000/v1/ops/health` and print result
11. Print "Done. Test from the React admin UI at /platform/document-centre"

### 5. `pdf-server/deploy/ubuntu/SETUP_STEPS.md` (append upgrade section)
Add an "Upgrading to Ops API (2026-04-24)" section documenting:
- `cd /opt/document-centre-api && git pull`
- `sudo bash scripts/install-ops-api.sh`
- Verification commands (health, system metrics, queue list)
- Troubleshooting (SSE not streaming → check nginx buffering; beat not firing → `journalctl -u document-centre-beat`)

## After approval
I'll create the 5 files and you run on the VPS:
```bash
cd /opt/document-centre-api && git pull
sudo bash scripts/install-ops-api.sh
```
That's it — the React admin UI at `/platform/document-centre` will go live.
