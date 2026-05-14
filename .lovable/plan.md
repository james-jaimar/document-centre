## Goal

Reconcile the installed `document-centre-api.service` on `srv1516161` with the canonical unit in the repo (`pdf-server/deploy/systemd/document-centre-api.service`), and add a one-shot installer so future hosts (and re-deploys) get the right unit without hand-editing.

## Current state vs. canonical

Installed at `/etc/systemd/system/document-centre-api.service`:

```
ExecStart=/opt/document-centre-api/.venv/bin/uvicorn app.main:app \
  --host 127.0.0.1 --port 8000
[Unit] After=network.target redis-server.service
(no Wants=, no Group=, no PYTHONUNBUFFERED, no proxy/forward flags,
 no --workers, no --timeout-keep-alive, no TimeoutStartSec, no KillSignal)
```

Repo canonical (`pdf-server/deploy/systemd/document-centre-api.service`):

```
ExecStart=... uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --workers 3 --proxy-headers --forwarded-allow-ips=* \
  --timeout-keep-alive 30
[Unit] After=...; Wants=redis-server.service
[Service] Group=root, PYTHONUNBUFFERED=1, TimeoutStartSec=60, KillSignal=SIGTERM
```

Functionally important deltas:
1. **`--workers 3`** — installed runs a single uvicorn worker; repo runs 3 (tuned for 4 vCPU / 16 GB).
2. **`--host 0.0.0.0`** — installed binds `127.0.0.1` only. Fine if nginx fronts it on the same box (which is the current topology — see `pdf-server/deploy/nginx/document-centre-api.conf`); changing to `0.0.0.0` would expose port 8000 publicly. **Decision needed.**
3. **`--proxy-headers --forwarded-allow-ips=*`** — needed so FastAPI sees the real client IP/scheme behind nginx. Currently missing.
4. **`--timeout-keep-alive 30`** — minor; aligns with nginx keep-alive.
5. `Wants=redis-server.service`, `Group=root`, `PYTHONUNBUFFERED=1`, `TimeoutStartSec=60`, `KillSignal=SIGTERM` — hardening / log-flushing niceties.

## Recommendation

Keep `--host 127.0.0.1` (nginx is already the public edge — see existing nginx conf). Update the **repo** canonical to match (single source of truth = what we actually run), then ship an installer that brings any host into compliance.

Concretely:

### 1. Edit repo canonical to bind localhost

`pdf-server/deploy/systemd/document-centre-api.service`:

- `--host 0.0.0.0` → `--host 127.0.0.1`
- Keep `--workers 3 --proxy-headers --forwarded-allow-ips=* --timeout-keep-alive 30`
- Keep `Wants=`, `Group=`, `PYTHONUNBUFFERED=1`, `TimeoutStartSec=60`, `KillSignal=SIGTERM`

Add a top-of-file comment: "Bound to 127.0.0.1 — nginx (`deploy/nginx/document-centre-api.conf`) is the public edge. Do NOT switch to 0.0.0.0 without firewalling port 8000."

### 2. New script: `pdf-server/scripts/install-api-service.sh`

Mirrors the heavy/light worker migrator pattern (`migrate-to-split-workers.sh`):

- Idempotent. Safe to re-run.
- If `/etc/systemd/system/document-centre-api.service` exists, `cmp` it against the repo file. If identical → no-op exit 0. If different → back up to `*.bak.$(date +%s)` and replace.
- `systemctl daemon-reload`
- `systemctl enable document-centre-api.service`
- `systemctl restart document-centre-api.service`
- Wait up to 30s for `is-active` + `curl -fsS http://127.0.0.1:8000/health` to return 200.
- On failure: print last 50 journal lines and exit 1 (do NOT auto-rollback — let the operator inspect).

### 3. Run on `srv1516161`

```
cd ~/document-centre && git pull
sudo bash pdf-server/scripts/install-api-service.sh
sudo bash pdf-server/scripts/verify-imposition-stack.sh   # expect 28/28
curl -fsS http://127.0.0.1:8000/health                    # expect 200
```

After restart there will be **3 uvicorn worker processes** instead of 1 (`ps -ef | grep uvicorn`).

## Files touched

- `pdf-server/deploy/systemd/document-centre-api.service` — change `--host` to `127.0.0.1`, add the safety comment.
- `pdf-server/scripts/install-api-service.sh` — new installer (cmp → backup → install → daemon-reload → enable → restart → health-check).

No app code, no DB, no nginx changes.

## Out of scope

- Switching the API to listen publicly on `0.0.0.0` — current nginx fronting is correct; flag if you want the opposite.
- Auditing the worker units (`document-centre-worker-heavy/light/beat`) for the same drift — can do as a follow-up if you want.
