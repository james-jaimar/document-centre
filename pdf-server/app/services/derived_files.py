from __future__ import annotations
import json
from sqlalchemy import text
from sqlalchemy.orm import Session


# NOTE: it's worth adding a unique partial index in a future migration so the
# DB itself enforces "one preview/thumbnail per (asset_id, page)":
#
#   create unique index if not exists derived_files_asset_kind_page_uniq
#     on derived_files (asset_id, kind, page)
#     where kind in ('preview_page', 'thumbnail_page') and page is not null;
#
# The repository below already behaves idempotently for those kinds.


_PER_PAGE_KINDS = {'preview_page', 'thumbnail_page'}


class DerivedFileRepository:
    def create_file(
        self,
        db: Session,
        *,
        asset_id: str | None,
        job_id: str | None,
        kind: str,
        storage_path: str,
        media_type: str,
        page: int | None = None,
        width: int | None = None,
        height: int | None = None,
        metadata: dict | None = None,
    ) -> None:
        """Insert a derived_files row.

        For per-page preview/thumbnail kinds, this is *idempotent*: if a row
        already exists for ``(asset_id, kind, page)`` it is updated in place
        rather than duplicated. This lets the salvage / re-render paths run
        safely without producing two thumbnails for the same page index.
        """
        meta_json = json.dumps(metadata or {})
        params = {
            'asset_id': asset_id,
            'job_id': job_id,
            'kind': kind,
            'storage_path': storage_path,
            'media_type': media_type,
            'page': page,
            'width': width,
            'height': height,
            'metadata': meta_json,
        }

        if asset_id and page is not None and kind in _PER_PAGE_KINDS:
            existing = db.execute(text(
                """
                select id from derived_files
                where asset_id = :asset_id and kind = :kind and page = :page
                limit 1
                """
            ), {'asset_id': asset_id, 'kind': kind, 'page': page}).first()

            if existing:
                db.execute(text(
                    """
                    update derived_files
                       set job_id = :job_id,
                           storage_path = :storage_path,
                           media_type = :media_type,
                           width = :width,
                           height = :height,
                           metadata = cast(:metadata as jsonb)
                     where id = :id
                    """
                ), {**params, 'id': existing[0]})
                db.commit()
                return

        db.execute(text("""
            insert into derived_files (asset_id, job_id, kind, storage_path, media_type, page, width, height, metadata)
            values (:asset_id, :job_id, :kind, :storage_path, :media_type, :page, :width, :height, cast(:metadata as jsonb))
        """), params)
        db.commit()

    def list_for_asset(self, db: Session, asset_id: str):
        rows = db.execute(text('select * from derived_files where asset_id=:asset_id order by created_at desc, page asc nulls last'), {'asset_id': asset_id}).mappings().all()
        return [dict(r) for r in rows]

    def pages_present(self, db: Session, asset_id: str, kind: str) -> set[int]:
        """Return the set of page numbers that already have a derived file
        of the given kind for this asset."""
        rows = db.execute(text(
            """
            select distinct page from derived_files
            where asset_id = :asset_id and kind = :kind and page is not null
            """
        ), {'asset_id': asset_id, 'kind': kind}).all()
        return {int(r[0]) for r in rows}


derived_file_repo = DerivedFileRepository()
