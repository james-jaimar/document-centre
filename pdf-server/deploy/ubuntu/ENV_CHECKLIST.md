# Ubuntu native deployment env checklist

Copy `.env.example` to `/opt/document-centre-api/.env` and set:

Required:
- `APP_ENV=production`
- `APP_DEBUG=false`
- `APP_HOST=0.0.0.0`
- `APP_PORT=8000`
- `SECRET_KEY=` a long random string
- `DATABASE_URL=` your Supabase Postgres connection string
- `SUPABASE_URL=` your project URL
- `SUPABASE_SERVICE_ROLE_KEY=` your service role key
- `SUPABASE_STORAGE_BUCKET=documents`
- `STORAGE_MODE=supabase`
- `REDIS_URL=redis://127.0.0.1:6379/0`
- `CELERY_BROKER_URL=redis://127.0.0.1:6379/0`
- `CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/1`
- `ADMIN_USERNAME=` your admin username
- `ADMIN_PASSWORD=` your admin password

Usually keep these defaults:
- `LIBREOFFICE_BIN=libreoffice`
- `GHOSTSCRIPT_BIN=gs`
- `QPDF_BIN=qpdf`
- `PDFCPU_BIN=pdfcpu`
- `LOCAL_STORAGE_PATH=/opt/document-centre-api/storage`
- `THUMBNAIL_DPI=120`
- `PREVIEW_DPI=160`
- `MAX_UPLOAD_MB=250`
