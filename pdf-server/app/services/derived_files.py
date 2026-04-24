from __future__ import annotations
import json
from sqlalchemy import text
from sqlalchemy.orm import Session

class DerivedFileRepository:
    def create_file(self, db: Session, *, asset_id: str | None, job_id: str | None, kind: str, storage_path: str, media_type: str, page: int | None = None, width: int | None = None, height: int | None = None, metadata: dict | None = None) -> None:
        db.execute(text("""
            insert into derived_files (asset_id, job_id, kind, storage_path, media_type, page, width, height, metadata)
            values (:asset_id, :job_id, :kind, :storage_path, :media_type, :page, :width, :height, cast(:metadata as jsonb))
        """), {
            'asset_id': asset_id,
            'job_id': job_id,
            'kind': kind,
            'storage_path': storage_path,
            'media_type': media_type,
            'page': page,
            'width': width,
            'height': height,
            'metadata': json.dumps(metadata or {}),
        })
        db.commit()

    def list_for_asset(self, db: Session, asset_id: str):
        rows = db.execute(text('select * from derived_files where asset_id=:asset_id order by created_at desc, page asc nulls last'), {'asset_id': asset_id}).mappings().all()
        return [dict(r) for r in rows]

derived_file_repo = DerivedFileRepository()
