-- Unique partial index: one preview_page + one thumbnail_page per (asset_id, page).
-- Enables ON CONFLICT bulk upserts in derived_file_repo and prevents the
-- retry/salvage path from leaving duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS derived_files_asset_kind_page_uniq
  ON public.derived_files (asset_id, kind, page)
  WHERE kind IN ('preview_page', 'thumbnail_page') AND page IS NOT NULL;

-- Speeds up pages_present() lookups during fan-out polling and the
-- post-render verify pass.
CREATE INDEX IF NOT EXISTS derived_files_asset_kind_idx
  ON public.derived_files (asset_id, kind)
  WHERE kind IN ('preview_page', 'thumbnail_page');
