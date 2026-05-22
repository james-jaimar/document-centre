## Root cause

`/openapi.json` doesn't list `/v1/operations/cloudprinter-render` because the **handler function was never added to `pdf-server/app/web/routes.py`**. The previous turn only added the import line:

```py
from app.tasks.cloudprinter_tasks import cloudprinter_render
```

…and the Pydantic schemas, but no `@api_router.post("/operations/cloudprinter-render")` block. FastAPI generates OpenAPI from registered routes, so without the decorator the path simply doesn't exist — restarting uvicorn won't change that.

Verified during exploration:
- `app.main` already mounts `api_router` at `/v1` (rotate, convert-office, etc. show up the same way).
- Worker `include=` already lists `app.tasks.cloudprinter_tasks` → Celery autodiscovery is fine.
- `PMP_CLOUDPRINTER_API_KEY` only exists in `.env.example`; it is NOT in `app.core.config.settings`, so the auth check needs to read it directly via `os.getenv` (or we add a settings field).

## Fix

### 1. Add the missing handler to `pdf-server/app/web/routes.py`

Append at the bottom (after `render-job-ticket`):

```py
import os, hmac
from fastapi import Request

@api_router.post(
    "/operations/cloudprinter-render",
    response_model=CloudprinterRenderResponse,
    tags=["operations"],
    summary="PMP Cloudprinter render offload",
)
def op_cloudprinter_render(
    payload: CloudprinterRenderRequest,
    authorization: str | None = Header(default=None),
):
    expected = os.getenv("PMP_CLOUDPRINTER_API_KEY", "")
    if not expected:
        raise HTTPException(503, "PMP Cloudprinter integration not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token, expected):
        raise HTTPException(401, "Invalid token")

    task = cloudprinter_render.delay(payload.model_dump(mode="json"))
    return CloudprinterRenderResponse(render_job_id=task.id, status="queued")
```

(Move the `import os, hmac` to the top of the file with the other imports; shown inline here only for clarity.)

### 2. Confirm the env var is set on the VPS

`PMP_CLOUDPRINTER_API_KEY=...` must be in `/opt/document-centre-api/.env` on **both** the API host and the worker host. Without it the endpoint will 503.

### 3. Deploy + restart on the VPS

```bash
cd /opt/document-centre-api
git pull
sudo systemctl restart document-centre-api
sudo systemctl restart document-centre-worker-light    # owns the 'thumbnails' queue
```

### 4. Verify

```bash
curl -s https://document-centre-api.jaimar.dev/openapi.json \
  | python3 -c "import sys,json; p=json.load(sys.stdin)['paths']; print([k for k in p if 'cloudprinter' in k])"
# expect: ['/v1/operations/cloudprinter-render']

curl -i -X POST https://document-centre-api.jaimar.dev/v1/operations/cloudprinter-render \
  -H "Authorization: Bearer $PMP_CLOUDPRINTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"test","callback_url":"https://example.com","callback_token":"x","jobs":[]}'
# expect: 200 with {"render_job_id":"...","status":"queued"}
```

## Files changed
- `pdf-server/app/web/routes.py` — add `os`/`hmac`/`Request` imports (Header already imported) and append the `op_cloudprinter_render` handler.

No other changes needed — schemas, task, and worker `include` are already correct.