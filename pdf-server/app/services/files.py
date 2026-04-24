from __future__ import annotations
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

class Workspace:
    def __init__(self):
        self.tmp = TemporaryDirectory(prefix='printforge-')
        self.root = Path(self.tmp.name)

    def path(self, name: str) -> Path:
        return self.root / name

    def cleanup(self):
        self.tmp.cleanup()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.cleanup()

def unique_name(prefix: str, suffix: str) -> str:
    return f'{prefix}/{uuid.uuid4()}{suffix}'
