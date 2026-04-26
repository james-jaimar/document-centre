-- ============================================================
-- Disk IO budget reduction
-- ============================================================
-- 1. Prune unbounded system log tables (cron + pg_net) on a daily schedule.
--    Both grow forever otherwise — net._http_response is currently the
--    largest table in the entire database (11 MB) and cron.job_run_details
--    is second (7 MB / 10k rows in 7 days).
-- 2. Add the two missing indexes that pg_stat_user_tables shows are causing
--    runaway sequential scans on small tables.
-- ============================================================

-- ---- Prune jobs ---------------------------------------------------------

-- Remove duplicates if this migration is re-applied.
DO $$
BEGIN
  PERFORM cron.unschedule('prune-net-http-response');
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('prune-cron-run-details');
EXCEPTION WHEN others THEN NULL;
END $$;

-- Keep 24h of pg_net HTTP responses. Saved snapshots are not used by the
-- app at runtime; they exist only for transient debugging.
SELECT cron.schedule(
  'prune-net-http-response',
  '15 3 * * *',
  $$ DELETE FROM net._http_response WHERE created < now() - interval '24 hours' $$
);

-- Keep 7 days of cron run history.
SELECT cron.schedule(
  'prune-cron-run-details',
  '20 3 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days' $$
);

-- ---- Missing indexes ----------------------------------------------------

-- order_items: 596,852 sequential tuple-reads on a 94-row table — every
-- order detail page (and the RLS sub-select for documents) walks the
-- whole table because there's no index on order_id.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

-- documents: 143,936 sequential tuple-reads on a 141-row table — same
-- pattern, no index on order_item_id.
CREATE INDEX IF NOT EXISTS idx_documents_order_item_id
  ON public.documents (order_item_id);

-- document_sections is also looked up by order_item_id and document_id
-- in the cleanup paths.
CREATE INDEX IF NOT EXISTS idx_document_sections_order_item_id
  ON public.document_sections (order_item_id);

CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
  ON public.document_sections (document_id);
