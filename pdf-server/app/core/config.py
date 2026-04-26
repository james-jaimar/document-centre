from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    app_name: str = Field(alias='APP_NAME', default='PrintForge Document Engine')
    app_env: str = Field(alias='APP_ENV', default='development')
    app_debug: bool = Field(alias='APP_DEBUG', default=True)
    app_host: str = Field(alias='APP_HOST', default='0.0.0.0')
    app_port: int = Field(alias='APP_PORT', default=8000)
    secret_key: str = Field(alias='SECRET_KEY', default='change-me')

    database_url: str = Field(alias='DATABASE_URL')
    redis_url: str = Field(alias='REDIS_URL')
    celery_broker_url: str = Field(alias='CELERY_BROKER_URL')
    celery_result_backend: str = Field(alias='CELERY_RESULT_BACKEND')

    supabase_url: str = Field(alias='SUPABASE_URL', default='')
    supabase_service_role_key: str = Field(alias='SUPABASE_SERVICE_ROLE_KEY', default='')
    supabase_storage_bucket: str = Field(alias='SUPABASE_STORAGE_BUCKET', default='documents')

    storage_mode: str = Field(alias='STORAGE_MODE', default='supabase')
    local_storage_path: str = Field(alias='LOCAL_STORAGE_PATH', default='./storage')
    aws_s3_bucket: str = Field(alias='AWS_S3_BUCKET', default='')
    aws_s3_region: str = Field(alias='AWS_S3_REGION', default='af-south-1')
    aws_access_key_id: str = Field(alias='AWS_ACCESS_KEY_ID', default='')
    aws_secret_access_key: str = Field(alias='AWS_SECRET_ACCESS_KEY', default='')

    libreoffice_bin: str = Field(alias='LIBREOFFICE_BIN', default='libreoffice')
    ghostscript_bin: str = Field(alias='GHOSTSCRIPT_BIN', default='gs')
    pdfcpu_bin: str = Field(alias='PDFCPU_BIN', default='pdfcpu')
    qpdf_bin: str = Field(alias='QPDF_BIN', default='qpdf')

    thumbnail_dpi: int = Field(alias='THUMBNAIL_DPI', default=120)
    preview_dpi: int = Field(alias='PREVIEW_DPI', default=160)
    max_upload_mb: int = Field(alias='MAX_UPLOAD_MB', default=250)

    # Preview pipeline resilience tunables. Each per-page step (rasterize +
    # upload + DB write) is retried independently. After the parallel pool
    # drains, any pages still missing go through a sequential salvage pass.
    preview_page_max_retries: int = Field(alias='PREVIEW_PAGE_MAX_RETRIES', default=3)
    preview_page_retry_base_ms: int = Field(alias='PREVIEW_PAGE_RETRY_BASE_MS', default=250)
    preview_salvage_enabled: bool = Field(alias='PREVIEW_SALVAGE_ENABLED', default=True)
    cors_origins: str = Field(alias='CORS_ORIGINS', default='http://localhost:5173')
    admin_username: str = Field(alias='ADMIN_USERNAME', default='admin')
    admin_password: str = Field(alias='ADMIN_PASSWORD', default='admin123')

settings = Settings()
