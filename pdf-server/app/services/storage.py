from __future__ import annotations
import mimetypes
from pathlib import Path
from typing import Optional
from supabase import create_client, Client
from app.core.config import settings

try:
    import boto3
except ImportError:
    boto3 = None  # type: ignore

import boto3
from botocore.config import Config

s3_client = boto3.client(
    's3',
    region_name='af-south-1',
    endpoint_url='https://s3.af-south-1.amazonaws.com',
    config=Config(signature_version='s3v4', s3={'addressing_style': 'virtual'}),
)
S3_BUCKET = 'jaimar-dev-600743178200-af-south-1-an'


class StorageService:
    def __init__(self):
        self.mode = settings.storage_mode
        self.local_root = Path(settings.local_storage_path)
        self.local_root.mkdir(parents=True, exist_ok=True)
        self._client: Client | None = None
        self._s3 = None

        if self.mode == 'supabase' and settings.supabase_url and settings.supabase_service_role_key:
            self._client = create_client(settings.supabase_url, settings.supabase_service_role_key)

        if self.mode == 's3':
            if boto3 is None:
                raise RuntimeError('boto3 is required for S3 storage mode. Install it: pip install boto3')
            self._s3 = boto3.client(
                's3',
                region_name=settings.aws_s3_region,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
            )

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def _absolute_local_source(self, storage_path: str) -> Optional[Path]:
        if not storage_path:
            return None
        if storage_path.startswith('file://'):
            return Path(storage_path[7:]).expanduser()
        candidate = Path(storage_path).expanduser()
        if candidate.is_absolute():
            return candidate
        return None

    def is_local_source(self, storage_path: str) -> bool:
        return self._absolute_local_source(storage_path) is not None

    @staticmethod
    def _tenant_prefix(source_path: str) -> str:
        """Extract 'tenants/{id}/' from source_storage_path, or '' for legacy paths."""
        if source_path and source_path.startswith("tenants/"):
            parts = source_path.split("/")
            if len(parts) >= 2:
                return f"tenants/{parts[1]}/"
        return ""


    # ------------------------------------------------------------------ #
    # Download
    # ------------------------------------------------------------------ #

    def download(self, storage_path: str, local_path: Path) -> Path:
        local_path.parent.mkdir(parents=True, exist_ok=True)

        # Absolute / file:// source — always honoured regardless of mode
        absolute_source = self._absolute_local_source(storage_path)
        if absolute_source is not None:
            if not absolute_source.exists():
                raise FileNotFoundError(f'Local source file not found: {absolute_source}')
            local_path.write_bytes(absolute_source.read_bytes())
            return local_path

        if self.mode == 'local':
            src = self.local_root / storage_path
            local_path.write_bytes(src.read_bytes())
            return local_path

        if self.mode == 's3':
            assert self._s3 is not None
            with open(local_path, 'wb') as f:
                self._s3.download_fileobj(settings.aws_s3_bucket, storage_path, f)
            return local_path

        # supabase
        assert self._client is not None
        data = self._client.storage.from_(settings.supabase_storage_bucket).download(storage_path)
        local_path.write_bytes(data)
        return local_path

    # ------------------------------------------------------------------ #
    # Upload
    # ------------------------------------------------------------------ #

    def upload(self, local_path: Path, storage_path: str, media_type: str | None = None) -> str:
        media_type = media_type or mimetypes.guess_type(local_path.name)[0] or 'application/octet-stream'

        if self.mode == 'local':
            dest = self.local_root / storage_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(local_path.read_bytes())
            return storage_path

        if self.mode == 's3':
            assert self._s3 is not None
            self._s3.upload_file(
                str(local_path),
                settings.aws_s3_bucket,
                storage_path,
                ExtraArgs={'ContentType': media_type},
            )
            return storage_path

        # supabase
        assert self._client is not None
        self._client.storage.from_(settings.supabase_storage_bucket).upload(
            storage_path,
            local_path.read_bytes(),
            {'content-type': media_type, 'upsert': 'true'},
        )
        return storage_path

    # ------------------------------------------------------------------ #
    # Delete (best-effort, used for short-lived temp render artefacts)
    # ------------------------------------------------------------------ #

    def delete(self, storage_path: str) -> None:
        if self._absolute_local_source(storage_path) is not None:
            return

        if self.mode == 'local':
            try:
                (self.local_root / storage_path).unlink(missing_ok=True)
            except Exception:
                pass
            return

        if self.mode == 's3':
            assert self._s3 is not None
            try:
                self._s3.delete_object(Bucket=settings.aws_s3_bucket, Key=storage_path)
            except Exception:
                pass
            return

        if self._client is not None:
            try:
                self._client.storage.from_(settings.supabase_storage_bucket).remove([storage_path])
            except Exception:
                pass

    # ------------------------------------------------------------------ #
    # Public URL
    # ------------------------------------------------------------------ #

    def public_url(self, storage_path: str) -> str | None:
        absolute_source = self._absolute_local_source(storage_path)
        if absolute_source is not None:
            return None

        if self.mode == 'local':
            return f'/local/{storage_path}'

        if self.mode == 's3':
            # All S3 access is via presigned URLs from the app layer
            return None

        assert self._client is not None
        return self._client.storage.from_(settings.supabase_storage_bucket).get_public_url(storage_path)

