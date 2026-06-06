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

    def bulk_upsert_page_files(
        self,
        db: Session,
        *,
        asset_id: str,
        job_id: str | None,
        rows: list[dict],
    ) -> int:
        """Insert/update many per-page preview/thumbnail rows in ONE
        transaction using the (asset_id, kind, page) unique partial index.

        Each row dict must contain: kind, storage_path, media_type, page,
        width, height, metadata (dict). Replaces N individual select +
        update + commit cycles from create_file() — the per-page bottleneck
        observed on multi-page uploads.

        Returns the number of rows processed.
        """
        if not rows:
            return 0
        sql = text(
            """
            insert into derived_files
                (asset_id, job_id, kind, storage_path, media_type,
                 page, width, height, metadata)
            values
                (:asset_id, :job_id, :kind, :storage_path, :media_type,
                 :page, :width, :height, cast(:metadata as jsonb))
            on conflict (asset_id, kind, page)
              where kind in ('preview_page', 'thumbnail_page')
                and page is not null
            do update set
                job_id       = excluded.job_id,
                storage_path = excluded.storage_path,
                media_type   = excluded.media_type,
                width        = excluded.width,
                height       = excluded.height,
                metadata     = excluded.metadata
            """
        )
        params = [
            {
                'asset_id': asset_id,
                'job_id': job_id,
                'kind': r['kind'],
                'storage_path': r['storage_path'],
                'media_type': r.get('media_type', 'image/png'),
                'page': r.get('page'),
                'width': r.get('width'),
                'height': r.get('height'),
                'metadata': json.dumps(r.get('metadata') or {}),
            }
            for r in rows
        ]
        db.execute(sql, params)
        db.commit()
        return len(params)

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

    def pages_present_both(self, db: Session, asset_id: str) -> set[int]:
        """Single query that returns pages with BOTH preview_page and
        thumbnail_page recorded. Replaces two pages_present() round-trips
        in the fan-out polling loop."""
        rows = db.execute(text(
            """
            select page
              from derived_files
             where asset_id = :asset_id
               and kind in ('preview_page', 'thumbnail_page')
               and page is not null
             group by page
             having count(distinct kind) = 2
            """
        ), {'asset_id': asset_id}).all()
        return {int(r[0]) for r in rows}

    def clear_page_renders(self, db: Session, asset_id: str) -> int:
        """Delete every per-page preview/thumbnail row for an asset.

        Used by geometry-changing operations (rotate, normalize-orientation,
        resize, crop) BEFORE the next ``generate-previews`` pass so the
        thumbnail picker cannot accidentally surface a stale image from a
        previous orientation/size of the asset.

        Returns the number of rows removed.
        """
        result = db.execute(text(
            """
            delete from derived_files
            where asset_id = :asset_id
              and kind in ('preview_page', 'thumbnail_page')
            """
        ), {'asset_id': asset_id})
        db.commit()
        return result.rowcount or 0


derived_file_repo = DerivedFileRepository()
