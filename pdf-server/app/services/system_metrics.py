"""Lightweight host metrics via psutil. Cheap to call (≤30ms typical)."""
from __future__ import annotations

import os
import time
from typing import Any

try:
    import psutil
except ImportError:  # pragma: no cover - psutil is in requirements
    psutil = None  # type: ignore


_BOOT_TIME = time.time()


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def system_snapshot() -> dict[str, Any]:
    """Return a single point-in-time snapshot of host metrics."""
    if psutil is None:
        return {"available": False, "error": "psutil not installed"}

    cpu = psutil.cpu_percent(interval=None)
    cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
    load1, load5, load15 = _safe(psutil.getloadavg, (0.0, 0.0, 0.0))

    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()

    disks: list[dict[str, Any]] = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except (PermissionError, OSError):
            continue
        disks.append(
            {
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
            }
        )

    net = psutil.net_io_counters()
    boot = psutil.boot_time()

    proc_count = len(psutil.pids())

    return {
        "available": True,
        "captured_at": time.time(),
        "uptime_seconds": int(time.time() - boot),
        "process_uptime_seconds": int(time.time() - _BOOT_TIME),
        "hostname": os.uname().nodename if hasattr(os, "uname") else os.environ.get("HOSTNAME", "unknown"),
        "cpu": {
            "percent": cpu,
            "per_core": cpu_per_core,
            "core_count": psutil.cpu_count(logical=True),
            "physical_cores": psutil.cpu_count(logical=False),
            "load_avg": {"1m": load1, "5m": load5, "15m": load15},
        },
        "memory": {
            "total": vm.total,
            "available": vm.available,
            "used": vm.used,
            "free": vm.free,
            "percent": vm.percent,
            "swap_total": swap.total,
            "swap_used": swap.used,
            "swap_percent": swap.percent,
        },
        "disks": disks,
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
            "errin": net.errin,
            "errout": net.errout,
            "dropin": net.dropin,
            "dropout": net.dropout,
        },
        "processes": {"count": proc_count},
    }


def top_processes(limit: int = 15) -> list[dict[str, Any]]:
    """Return the top N processes by RSS memory. Used in the Overview page."""
    if psutil is None:
        return []
    procs = []
    for p in psutil.process_iter(attrs=["pid", "name", "username", "cpu_percent", "memory_info"]):
        try:
            info = p.info
            mem = info.get("memory_info")
            procs.append(
                {
                    "pid": info["pid"],
                    "name": info["name"],
                    "user": info.get("username"),
                    "cpu_percent": info.get("cpu_percent") or 0.0,
                    "rss_bytes": getattr(mem, "rss", 0) if mem else 0,
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x["rss_bytes"], reverse=True)
    return procs[:limit]
