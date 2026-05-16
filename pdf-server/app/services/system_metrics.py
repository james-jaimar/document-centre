"""Lightweight host metrics via psutil.

CPU sampling uses a module-level background thread so every uvicorn worker
returns the **same** host-wide reading regardless of which process handles
the HTTP request. `psutil.cpu_percent(interval=None)` is delta-since-last-
call PER PROCESS, which produced near-zero readings on a multi-worker API
host and made the Ops dashboard look "dead".

It also samples Celery worker child processes (heavy/light) so the dashboard
can show a Task-Manager-style per-worker CPU/RSS view.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore


_BOOT_TIME = time.time()


# ─── Background CPU sampler ───────────────────────────────────────
# A single daemon thread per Python process samples host CPU every
# SAMPLE_INTERVAL seconds with a blocking `interval=SAMPLE_INTERVAL`
# call (the only way to get a real reading). HTTP requests read the
# cached value — O(microseconds) and correct.

_SAMPLE_INTERVAL = 1.0  # seconds — matches what humans want to see
_cpu_lock = threading.Lock()
_cpu_state: dict[str, Any] = {
    "percent": 0.0,
    "per_core": [],
    "captured_at": 0.0,
}
_sampler_started = False


def _sampler_loop() -> None:
    """Run forever, refreshing the cached CPU reading."""
    if psutil is None:
        return
    # Prime psutil's internal counters.
    psutil.cpu_percent(interval=None)
    psutil.cpu_percent(interval=None, percpu=True)
    while True:
        try:
            percent = psutil.cpu_percent(interval=_SAMPLE_INTERVAL)
            per_core = psutil.cpu_percent(interval=None, percpu=True)
            with _cpu_lock:
                _cpu_state["percent"] = float(percent)
                _cpu_state["per_core"] = list(per_core)
                _cpu_state["captured_at"] = time.time()
        except Exception:
            # Never let the sampler die.
            time.sleep(_SAMPLE_INTERVAL)


def _ensure_sampler() -> None:
    global _sampler_started
    if _sampler_started or psutil is None:
        return
    _sampler_started = True
    t = threading.Thread(target=_sampler_loop, name="cpu-sampler", daemon=True)
    t.start()


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def system_snapshot() -> dict[str, Any]:
    """Return a single point-in-time snapshot of host metrics."""
    if psutil is None:
        return {"available": False, "error": "psutil not installed"}

    _ensure_sampler()

    with _cpu_lock:
        cpu = _cpu_state["percent"]
        cpu_per_core = list(_cpu_state["per_core"])
        cpu_captured_at = _cpu_state["captured_at"]

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
        "cpu_sample_age_s": max(0.0, time.time() - cpu_captured_at) if cpu_captured_at else None,
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


# ─── Celery worker process discovery ──────────────────────────────
# We discover celery worker processes by scanning the process tree for
# `celery -A app.worker` command lines. Each MainProcess has child workers
# (the prefork pool). We sample CPU/RSS per process so the UI can show a
# Task-Manager-style per-worker breakdown.

# Cache previous CPU sample so cpu_percent returns a real delta.
_proc_cpu_primed: set[int] = set()


def _is_celery_proc(p: "psutil.Process") -> bool:
    try:
        cmdline = p.cmdline()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False
    if not cmdline:
        return False
    joined = " ".join(cmdline)
    return "celery" in joined and "app.worker" in joined


def celery_workers_live() -> list[dict[str, Any]]:
    """Return live per-worker stats grouped by Celery MainProcess.

    Each entry looks like:
      {
        name: "heavy",                 # parsed from -n flag if present
        pid: 1234,
        cpu_percent: 87.4,             # SUM across master + children
        rss_bytes: 2_010_000_000,      # SUM across master + children
        children: [{pid, cpu_percent, rss_bytes, status}],
        active_tasks: null,            # filled in by caller from celery inspect
      }
    """
    if psutil is None:
        return []

    _ensure_sampler()

    masters: list[psutil.Process] = []
    for p in psutil.process_iter(attrs=["pid", "ppid"]):
        try:
            if not _is_celery_proc(p):
                continue
            ppid = p.ppid()
            parent = psutil.Process(ppid) if ppid else None
            if parent and _is_celery_proc(parent):
                continue  # this is a child; we'll pick it up via parent.children()
            masters.append(p)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    results: list[dict[str, Any]] = []
    for master in masters:
        try:
            cmdline = master.cmdline()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

        # Parse worker name from `-n heavy@host` / `--hostname=...`
        name = "celery"
        for i, tok in enumerate(cmdline):
            if tok == "-n" and i + 1 < len(cmdline):
                name = cmdline[i + 1].split("@", 1)[0]
                break
            if tok.startswith("--hostname="):
                name = tok.split("=", 1)[1].split("@", 1)[0]
                break

        try:
            children = master.children(recursive=False)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            children = []

        all_procs = [master] + children
        child_rows: list[dict[str, Any]] = []
        total_cpu = 0.0
        total_rss = 0

        for proc in all_procs:
            try:
                # Prime cpu_percent on first sight so the next call yields
                # a real delta. Until then report 0 for this PID.
                if proc.pid not in _proc_cpu_primed:
                    proc.cpu_percent(interval=None)
                    _proc_cpu_primed.add(proc.pid)
                    cpu = 0.0
                else:
                    cpu = proc.cpu_percent(interval=None)
                rss = proc.memory_info().rss
                status = proc.status()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            total_cpu += cpu
            total_rss += rss
            if proc.pid != master.pid:
                child_rows.append(
                    {
                        "pid": proc.pid,
                        "cpu_percent": round(cpu, 1),
                        "rss_bytes": rss,
                        "status": status,
                    }
                )

        results.append(
            {
                "name": name,
                "pid": master.pid,
                "cpu_percent": round(total_cpu, 1),
                "rss_bytes": total_rss,
                "children": child_rows,
                "child_count": len(child_rows),
            }
        )

    # Garbage-collect primed PIDs that no longer exist so the set doesn't
    # grow unbounded.
    if len(_proc_cpu_primed) > 500:
        alive = {p.pid for p in psutil.process_iter()}
        _proc_cpu_primed.intersection_update(alive)

    return results
