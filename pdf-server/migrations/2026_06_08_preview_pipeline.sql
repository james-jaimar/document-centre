-- =============================================================================
-- Document Centre — Render-first preview pipeline (2026-06-08)
-- Idempotent. Safe to re-run.
-- =============================================================================
--
-- The new pipeline does ONE bulk upsert into derived_files at the end of a
-- render (after all uploads have succeeded), instead of writing rows
-- per-page inside the render loop. The upsert relies on a unique partial
-- index over (asset_id, kind, page) for per-page preview/thumbnail rows.
--
-- The `WHERE` clause keeps `prepared_pdf` and other non-paginated kinds
-- unaffected — they can still have multiple rows with NULL page.

CREATE UNIQUE INDEX IF NOT EXISTS derived_files_asset_kind_page_uniq
  ON public.derived_files (asset_id, kind, page)
  WHERE kind IN ('preview_page', 'thumbnail_page') AND page IS NOT NULL;
