from __future__ import annotations
import mimetypes
import os
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
from botocore.exceptions import ClientError


class S3AccessError(RuntimeError):
    """Friendly S3 error with classification (permission / missing / region / unknown)."""

    def __init__(self, kind: str, message: str, *, bucket: str, key: str, status: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.bucket = bucket
        self.key = key
        self.status = status


def _classify_s3_error(op: str, key: str, exc: Exception) -> S3AccessError:
    bucket = settings.aws_s3_bucket
    region = settings.aws_s3_region
    status = None
    code = None
    if isinstance(exc, ClientError):
        status = exc.response.get('ResponseMetadata', {}).get('HTTPStatusCode')
        code = exc.response.get('Error', {}).get('Code')
    if status == 403 or code in {'AccessDenied', 'Forbidden', '403'}:
        msg = (
            f"S3 {op} permission denied for bucket={bucket!r} key={key!r} "
            f"region={region!r}. The Cloud Run AWS key (PDF_AWS_ACCESS_KEY_ID / "
            f"PDF_AWS_SECRET_ACCESS_KEY in GCP Secret Manager) needs s3:GetObject "
            f"(and s3:PutObject/DeleteObject) on arn:aws:s3:::{bucket}/*."
        )
        return S3AccessError('permission_denied', msg, bucket=bucket, key=key, status=403)
    if status == 404 or code in {'NoSuchKey', '404', 'NoSuchBucket'}:
        msg = f"S3 {op}: object not found at bucket={bucket!r} key={key!r}."
        return S3AccessError('not_found', msg, bucket=bucket, key=key, status=404)
    if code in {'PermanentRedirect', 'AuthorizationHeaderMalformed', 'IllegalLocationConstraintException'}:
        msg = f"S3 {op}: bucket/region mismatch (bucket={bucket!r} configured region={region!r}). Detail: {exc}"
        return S3AccessError('region_mismatch', msg, bucket=bucket, key=key, status=status)
    return S3AccessError('unknown', f"S3 {op} failed for bucket={bucket!r} key={key!r}: {type(exc).__name__}: {exc}",
                          bucket=bucket, key=key, status=status)




def _build_s3_client(region: str, access_key: str | None = None, secret_key: str | None = None):
    """Build a boto3 S3 client tuned for parallel preview uploads.

    Defaults:
      - connect_timeout=5s, read_timeout=30s (was unset → 60s+ default)
      - max_pool_connections=32 (was 10) so the per-page upload pool
        (render_io_concurrency=8) doesn't starve other workers.
      - retries={'mode': 'standard', 'max_attempts': 3} so a single
        S3 hiccup retries inside boto instead of failing the whole task.
    """
    cfg = Config(
        signature_version='s3v4',
        s3={'addressing_style': 'virtual'},
        connect_timeout=int(os.getenv('S3_CONNECT_TIMEOUT', '5')),
        read_timeout=int(os.getenv('S3_READ_TIMEOUT', '30')),
        max_pool_connections=int(os.getenv('S3_MAX_POOL_CONNECTIONS', '32')),
        retries={'mode': 'standard', 'max_attempts': 3},
    )
    kwargs: dict = {'region_name': region, 'config': cfg}
    if access_key and secret_key:
        kwargs['aws_access_key_id'] = access_key
        kwargs['aws_secret_access_key'] = secret_key
    else:
        kwargs['endpoint_url'] = f'https://s3.{region}.amazonaws.com'
    return boto3.client('s3', **kwargs)


# (Removed dead module-level boto3 client + hardcoded bucket. The live
# client is built lazily by StorageService.__init__ from settings, which
# pulls credentials from GCP Secret Manager at runtime. Keeping a module-
# scoped client tried to resolve credentials at import time and added cold-
# start latency for no benefit.)



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
            self._s3 = _build_s3_client(
                settings.aws_s3_region,
                access_key=settings.aws_access_key_id,
                secret_key=settings.aws_secret_access_key,
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
    # Diagnostics
    # ------------------------------------------------------------------ #

    def diagnose(self, storage_path: str | None = None) -> dict:
        """Return non-secret S3 diagnostics. Optionally HEAD a specific key."""
        info: dict = {
            'mode': self.mode,
            'bucket': settings.aws_s3_bucket,
            'region': settings.aws_s3_region,
            'access_key_fingerprint': (settings.aws_access_key_id[:4] + '…' + settings.aws_access_key_id[-4:])
                if settings.aws_access_key_id else None,
            'has_secret_key': bool(settings.aws_secret_access_key),
        }
        if self.mode != 's3' or self._s3 is None:
            info['probe'] = {'skipped': 'not_s3_mode'}
            return info
        if storage_path:
            try:
                resp = self._s3.head_object(Bucket=settings.aws_s3_bucket, Key=storage_path)
                info['probe'] = {
                    'key': storage_path,
                    'status': 'ok',
                    'content_length': resp.get('ContentLength'),
                    'content_type': resp.get('ContentType'),
                    'etag': resp.get('ETag'),
                }
            except Exception as exc:  # noqa: BLE001
                err = _classify_s3_error('head_object', storage_path, exc)
                info['probe'] = {
                    'key': storage_path,
                    'status': 'error',
                    'kind': err.kind,
                    'http_status': err.status,
                    'message': str(err),
                }
        return info

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
            try:
                with open(local_path, 'wb') as f:
                    self._s3.download_fileobj(settings.aws_s3_bucket, storage_path, f)
            except Exception as exc:  # noqa: BLE001
                raise _classify_s3_error('download', storage_path, exc) from exc
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
            try:
                self._s3.upload_file(
                    str(local_path),
                    settings.aws_s3_bucket,
                    storage_path,
                    ExtraArgs={'ContentType': media_type},
                )
            except Exception as exc:  # noqa: BLE001
                raise _classify_s3_error('upload', storage_path, exc) from exc
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

