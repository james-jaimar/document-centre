from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.core.config import settings
from app.web.routes import api_router
from app.web.admin import admin_router

app = FastAPI(title=settings.app_name, debug=settings.app_debug)
app.include_router(api_router, prefix='/v1')
app.include_router(admin_router)
app.mount('/static', StaticFiles(directory='app/static'), name='static')

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
    return {'status': 'ok', 'service': settings.app_name, 'env': settings.app_env}
