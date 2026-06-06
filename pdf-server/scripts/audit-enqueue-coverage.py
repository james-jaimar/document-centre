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

def _parse_registry() -> set[str]:
    """Extract TASK_REGISTRY keys via AST (avoids importing heavy task modules)."""
    src = (APP / "tasks" / "registry.py").read_text()
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "TASK_REGISTRY" and isinstance(node.value, ast.Dict):
                    return {k.value for k in node.value.keys if isinstance(k, ast.Constant)}
    return set()


def _parse_queue_map() -> set[str]:
    src = (APP / "core" / "queue.py").read_text()
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "QUEUE_TO_CLOUD_TASKS_QUEUE":
            if isinstance(node.value, ast.Dict):
                return {k.value for k in node.value.keys if isinstance(k, ast.Constant)}
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "QUEUE_TO_CLOUD_TASKS_QUEUE" and isinstance(node.value, ast.Dict):
                    return {k.value for k in node.value.keys if isinstance(k, ast.Constant)}
    return set()


TASK_REGISTRY = _parse_registry()
QUEUE_TO_CLOUD_TASKS_QUEUE = _parse_queue_map()



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
