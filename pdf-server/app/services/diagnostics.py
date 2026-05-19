from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from app.core.config import settings

ICC_DIR = Path("/opt/document-centre-api/icc")


def check_binary(command: str) -> dict:
    path = shutil.which(command)
    return {
        "command": command,
        "found": bool(path),
        "path": path,
    }


def get_ghostscript_version() -> str | None:
    try:
        result = subprocess.run(
            [settings.ghostscript_bin, "--version"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except Exception:
        return None


def get_libreoffice_version() -> str | None:
    try:
        result = subprocess.run(
            [settings.libreoffice_bin, "--version"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except Exception:
        return None


def list_icc_profiles() -> list[str]:
    if not ICC_DIR.exists():
        return []
    return sorted(
        str(p.relative_to(ICC_DIR))
        for p in ICC_DIR.rglob("*")
        if p.is_file() and p.suffix.lower() in {".icc", ".icm"}
    )


def redis_ping() -> dict:
    try:
        import redis

        r = redis.Redis.from_url(settings.redis_url)
        ok = r.ping()
        return {"ok": bool(ok)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def get_diagnostics() -> dict:
    return {
        "app_env": getattr(settings, "app_env", "unknown"),
        "storage_mode": getattr(settings, "storage_mode", "unknown"),
        "tmp_dir": getattr(settings, "tmp_dir", "/tmp/printforge"),
        "local_storage_path": getattr(settings, "local_storage_path", "/opt/document-centre-api/storage"),
        "binaries": {
            "ghostscript": check_binary(settings.ghostscript_bin),
            "libreoffice": check_binary(settings.libreoffice_bin),
            "qpdf": check_binary(settings.qpdf_bin),
            "mutool": check_binary(settings.mutool_bin),
        },
        "versions": {
            "ghostscript": get_ghostscript_version(),
            "libreoffice": get_libreoffice_version(),
        },
        "redis": redis_ping(),
        "icc_profiles": list_icc_profiles(),
    }
