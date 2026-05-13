
DROP TABLE IF EXISTS public.order_item_production;
DROP TYPE IF EXISTS public.production_status;
DROP FUNCTION IF EXISTS public.tenant_id_for_order_item(UUID);

ALTER TABLE public.order_jobs
  ADD COLUMN IF NOT EXISTS print_ready_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS imposed_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS job_ticket_pdf_path TEXT;
