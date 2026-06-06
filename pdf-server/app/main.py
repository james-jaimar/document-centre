import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.core.config import settings
from app.web.routes import api_router
from app.web.admin import admin_router
from app.web.ops_routes import ops_router
from app.web.email_webhooks import email_webhooks_router

# ROLE determines which routers are mounted. The same image powers:
#   api                 → public FastAPI + beat endpoints (Cloud Scheduler)
#   worker-*-http       → /internal/tasks/* only (Cloud Tasks push)
ROLE = os.getenv("ROLE", "api").lower()
IS_API = ROLE == "api"
IS_HTTP_WORKER = ROLE.startswith("worker-") and ROLE.endswith("-http")

app = FastAPI(title=settings.app_name, debug=settings.app_debug)

if IS_API:
    app.include_router(api_router, prefix='/v1')
    app.include_router(ops_router, prefix='/v1')
    app.include_router(admin_router)
    app.include_router(email_webhooks_router)
    app.mount('/static', StaticFiles(directory='app/static'), name='static')
    # Cloud Scheduler beat endpoints (replaces Celery beat).
    from app.web.beat_routes import beat_router, email_push_router
    app.include_router(beat_router)
    # Supabase Database Webhook push endpoint (replaces VPS LISTEN/NOTIFY).
    app.include_router(email_push_router)

if IS_HTTP_WORKER:
    # Cloud Tasks → worker push endpoints.
    from app.web.tasks_routes import tasks_router
    app.include_router(tasks_router)

@app.get('/')
def root():
    return {'name': settings.app_name, 'status': 'ok'}

@app.get('/local/{storage_path:path}')
def local_file(storage_path: str):
    if settings.storage_mode != 'local':
        raise HTTPException(status_code=404, detail='Local file serving is disabled')
    path = Path(settings.local_storage_path) / storage_path
    if not path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    return FileResponse(path)


@app.get('/health')
def health():
    # Expose non-secret runtime facts so cutover/config drift is visible
    # without trawling Cloud Run env pages. Useful when previews go slow:
    # if `queue_backend` is not 'cloud_tasks' on a worker, generate_previews
    # will silently take the wrong (Celery fan-out) path.
    import os as _os
    return {
        'status': 'ok',
        'service': settings.app_name,
        'env': settings.app_env,
        'role': _os.getenv('ROLE', 'api'),
        'queue_backend': _os.getenv('QUEUE_BACKEND', 'celery'),
        'cpu_count': _os.cpu_count(),
        'render_cpu_concurrency': settings.render_cpu_concurrency,
        'render_io_concurrency': settings.render_io_concurrency,
        'render_batch_threshold': settings.render_batch_threshold,
        'render_fanout_enabled': settings.render_fanout_enabled,
    }
