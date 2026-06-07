import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_render_cpu() -> int:
    """Leave one core free for uvicorn / redis on a small box."""
    return max(1, (os.cpu_count() or 2) - 1)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    app_name: str = Field(alias='APP_NAME', default='PrintForge Document Engine')
    app_env: str = Field(alias='APP_ENV', default='development')
    app_debug: bool = Field(alias='APP_DEBUG', default=True)
    app_host: str = Field(alias='APP_HOST', default='0.0.0.0')
    app_port: int = Field(alias='APP_PORT', default=8000)
    secret_key: str = Field(alias='SECRET_KEY', default='change-me')

    database_url: str = Field(alias='DATABASE_URL')

    def model_post_init(self, __context) -> None:
        # Normalize plain Postgres URLs to use the installed Psycopg 3 driver.
        # The image ships psycopg[binary] (v3) — NOT psycopg2 — so without the
        # explicit "+psycopg" driver, SQLAlchemy defaults to psycopg2 and
        # boot fails with ModuleNotFoundError: No module named 'psycopg2'.
        url = self.database_url
        if url.startswith('postgresql://'):
            object.__setattr__(self, 'database_url',
                               'postgresql+psycopg://' + url[len('postgresql://'):])
        elif url.startswith('postgres://'):
            object.__setattr__(self, 'database_url',
                               'postgresql+psycopg://' + url[len('postgres://'):])
        elif url.startswith('postgresql+psycopg2://'):
            object.__setattr__(self, 'database_url',
                               'postgresql+psycopg://' + url[len('postgresql+psycopg2://'):])
    # Redis / Celery are optional in Phase 1 of the Cloud Run cutover:
    # the API container does not connect to Redis at import time (Celery is
    # constructed lazily — only .delay() / .control.* actually open sockets).
    # Workers on the VPS still get the real URLs via systemd env. Defaults
    # below keep `pdf-api` booting on Cloud Run without Redis configured.
    redis_url: str = Field(alias='REDIS_URL', default='memory://')
    celery_broker_url: str = Field(alias='CELERY_BROKER_URL', default='memory://')
    celery_result_backend: str = Field(alias='CELERY_RESULT_BACKEND', default='cache+memory://')

    supabase_url: str = Field(alias='SUPABASE_URL', default='')
    supabase_service_role_key: str = Field(alias='SUPABASE_SERVICE_ROLE_KEY', default='')
    supabase_storage_bucket: str = Field(alias='SUPABASE_STORAGE_BUCKET', default='')

    storage_mode: str = Field(alias='STORAGE_MODE', default='s3')
    local_storage_path: str = Field(alias='LOCAL_STORAGE_PATH', default='./storage')
    aws_s3_bucket: str = Field(alias='AWS_S3_BUCKET', default='')
    aws_s3_region: str = Field(alias='AWS_S3_REGION', default='af-south-1')
    aws_access_key_id: str = Field(alias='AWS_ACCESS_KEY_ID', default='')
    aws_secret_access_key: str = Field(alias='AWS_SECRET_ACCESS_KEY', default='')

    libreoffice_bin: str = Field(alias='LIBREOFFICE_BIN', default='libreoffice')
    ghostscript_bin: str = Field(alias='GHOSTSCRIPT_BIN', default='gs')
    pdfcpu_bin: str = Field(alias='PDFCPU_BIN', default='pdfcpu')
    qpdf_bin: str = Field(alias='QPDF_BIN', default='qpdf')
    mutool_bin: str = Field(alias='MUTOOL_BIN', default='mutool')

    thumbnail_dpi: int = Field(alias='THUMBNAIL_DPI', default=96)
    # Preview DPI was 130 (≈1075×1520px for A4). Dropped to 96 (≈790×1120px)
    # — still sharp on retina screens, ~45% fewer pixels through GS + S3.
    preview_dpi: int = Field(alias='PREVIEW_DPI', default=96)
    max_upload_mb: int = Field(alias='MAX_UPLOAD_MB', default=250)

    # Preview pipeline resilience tunables. Each per-page step (rasterize +
    # upload + DB write) is retried independently. After the parallel pool
    # drains, any pages still missing go through a sequential salvage pass.
    preview_page_max_retries: int = Field(alias='PREVIEW_PAGE_MAX_RETRIES', default=3)
    preview_page_retry_base_ms: int = Field(alias='PREVIEW_PAGE_RETRY_BASE_MS', default=250)
    preview_salvage_enabled: bool = Field(alias='PREVIEW_SALVAGE_ENABLED', default=True)

    # In-process render parallelism. CPU pool runs Ghostscript + Pillow
    # downscale (CPU-bound — capping at cpu_count-1 prevents thrashing).
    # IO pool runs S3 upload + DB write (network/disk-bound — happy with 8).
    # Pages stream from CPU → IO so the next page rasterises while the
    # previous one uploads.
    render_cpu_concurrency: int = Field(alias='RENDER_CPU_CONCURRENCY', default_factory=_default_render_cpu)
    render_io_concurrency: int = Field(alias='RENDER_IO_CONCURRENCY', default=8)

    # Per-page Celery fan-out: dispatch each page as its own task on the
    # thumbnails queue so a single upload uses ALL light-worker children
    # (default 4) in parallel instead of one in-process thread pool.
    # Falls back to the in-process two-pool design when disabled.
    render_fanout_enabled: bool = Field(alias='RENDER_FANOUT_ENABLED', default=True)
    render_fanout_poll_interval_ms: int = Field(alias='RENDER_FANOUT_POLL_INTERVAL_MS', default=200)
    render_fanout_timeout_seconds: int = Field(alias='RENDER_FANOUT_TIMEOUT_SECONDS', default=300)
    # Stall guard: if no new page lands within this many seconds, abandon
    # the fan-out wait and let the salvage pass recover the gaps. Without
    # this, a stuck subtask (e.g. recycled Cloud Run worker) could hold up
    # the whole job until render_fanout_timeout_seconds expires.
    render_fanout_stall_seconds: int = Field(alias='RENDER_FANOUT_STALL_SECONDS', default=30)

    # Single-process batch render: when page_count <= this threshold, run
    # ONE Ghostscript invocation for the whole document (avoiding N×
    # per-page GS startup cost) and then upload/downscale concurrently.
    # Raised to 200 so the vast majority of customer uploads take the
    # batch path — fanout incurs N extra S3 downloads (one per page
    # subtask) and is only worthwhile for very large books.
    render_batch_threshold: int = Field(alias='RENDER_BATCH_THRESHOLD', default=200)

    # Cloud Tasks retry idempotency guard. If a retry arrives while a job is
    # marked running, keep the task retryable for this grace period instead of
    # acknowledging it as success. Preview renders get a shorter window so a
    # killed light-worker does not leave customer uploads stuck for minutes.
    cloud_tasks_running_grace_seconds: int = Field(alias='CLOUD_TASKS_RUNNING_GRACE_SECONDS', default=300)
    cloud_tasks_preview_running_grace_seconds: int = Field(alias='CLOUD_TASKS_PREVIEW_RUNNING_GRACE_SECONDS', default=180)

    # Shared on-disk PDF cache. Workers (heavy + light) all co-locate on
    # the same host, so we can hand the prepared PDF over the local disk
    # instead of round-tripping through S3 between prepare_for_product
    # and generate_previews. S3 remains the source of truth; the cache is
    # purely advisory. Misses fall back to storage.download.
    pdf_cache_enabled: bool = Field(alias='PDF_CACHE_ENABLED', default=True)
    pdf_cache_dir: str = Field(alias='PDF_CACHE_DIR', default='/var/cache/document-centre/pdf-cache')
    pdf_cache_max_age_seconds: int = Field(alias='PDF_CACHE_MAX_AGE_SECONDS', default=1800)

    cors_origins: str = Field(alias='CORS_ORIGINS', default='http://localhost:5173')
    admin_username: str = Field(alias='ADMIN_USERNAME', default='admin')
    admin_password: str = Field(alias='ADMIN_PASSWORD', default='admin123')

settings = Settings()
