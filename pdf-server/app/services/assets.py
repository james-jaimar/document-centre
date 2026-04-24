from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session

class AssetRepository:
    def create_asset(self, db: Session, payload: dict) -> str:
        asset_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        db.execute(text('''
            insert into assets (id, original_filename, media_type, source_storage_path, status, metadata, created_at, updated_at)
            values (:id, :original_filename, :media_type, :source_storage_path, 'pending', cast(:metadata as jsonb), :now, :now)
        '''), {
            'id': asset_id,
            'original_filename': payload['original_filename'],
            'media_type': payload['media_type'],
            'source_storage_path': payload['source_storage_path'],
            'metadata': json.dumps({**payload.get('metadata', {}), **({"source_url": payload["source_url"]} if payload.get("source_url") else {})}),
            'now': now,
        })
        db.commit()
        return str(asset_id)

    def get_asset(self, db: Session, asset_id: str):
        row = db.execute(text('select * from assets where id=:id'), {'id': asset_id}).mappings().first()
        return dict(row) if row else None

    def update_asset(self, db: Session, asset_id: str, updates: dict):
        clauses = []
        params = {'id': asset_id}
        for idx, (key, value) in enumerate(updates.items()):
            pname = f'v{idx}'
            if key in {'boxes', 'metadata'}:
                clauses.append(f"{key}=cast(:{pname} as jsonb)")
                params[pname] = json.dumps(value)
            else:
                clauses.append(f"{key}=:{pname}")
                params[pname] = value
        clauses.append('updated_at=now()')
        db.execute(text(f"update assets set {', '.join(clauses)} where id=:id"), params)
        db.commit()

asset_repo = AssetRepository()
