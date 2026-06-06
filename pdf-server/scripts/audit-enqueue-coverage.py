#!/usr/bin/env python3
"""Audit that every enqueue("name", ..., queue="...") call site in app/ is
dispatchable via both Celery and Cloud Tasks paths.

Fails (exit 1) if:
  - a task name passed to enqueue() is not in app.tasks.registry.TASK_REGISTRY
  - a queue= value is not in app.core.queue.QUEUE_TO_CLOUD_TASKS_QUEUE

Run from repo root:  python3 pdf-server/scripts/audit-enqueue-coverage.py
"""
from __future__ import annotations

import ast
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
PDF_SERVER = HERE.parent
APP = PDF_SERVER / "app"

sys.path.insert(0, str(PDF_SERVER))

# Stub out heavy optional deps before importing the registry. We only need the
# names and queue map; we don't execute any task code.
import types  # noqa: E402

for mod in ("celery", "celery.schedules"):
    if mod not in sys.modules:
        m = types.ModuleType(mod)
        sys.modules[mod] = m

from app.core.queue import QUEUE_TO_CLOUD_TASKS_QUEUE  # noqa: E402
from app.tasks.registry import TASK_REGISTRY  # noqa: E402


def find_enqueue_calls(root: pathlib.Path):
    """Yield (file, lineno, task_name, queue_name) for every enqueue(...) call."""
    for path in root.rglob("*.py"):
        try:
            tree = ast.parse(path.read_text(), filename=str(path))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = None
            if isinstance(func, ast.Name) and func.id == "enqueue":
                name = "enqueue"
            elif isinstance(func, ast.Attribute) and func.attr == "enqueue":
                name = "enqueue"
            if name is None:
                continue
            if not node.args or not isinstance(node.args[0], ast.Constant):
                continue
            task_name = node.args[0].value
            queue = "default"
            for kw in node.keywords:
                if kw.arg == "queue" and isinstance(kw.value, ast.Constant):
                    queue = kw.value.value
            yield path, node.lineno, task_name, queue


def main() -> int:
    errors: list[str] = []
    seen = 0
    for path, lineno, task_name, queue in find_enqueue_calls(APP):
        seen += 1
        if task_name not in TASK_REGISTRY:
            errors.append(
                f"{path}:{lineno} enqueue({task_name!r}) — not in TASK_REGISTRY"
            )
        if queue not in QUEUE_TO_CLOUD_TASKS_QUEUE:
            errors.append(
                f"{path}:{lineno} queue={queue!r} — not in QUEUE_TO_CLOUD_TASKS_QUEUE"
            )

    print(f"Scanned {seen} enqueue() call sites under {APP}")
    print(f"Registry has {len(TASK_REGISTRY)} tasks; queue map has {len(QUEUE_TO_CLOUD_TASKS_QUEUE)} queues")

    if errors:
        print("\nFAIL:")
        for e in errors:
            print(" -", e)
        return 1

    print("\nOK — every enqueue() call site is dispatchable in both Celery and Cloud Tasks modes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
