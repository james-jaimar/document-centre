ALTER TABLE public.order_jobs
  ADD COLUMN IF NOT EXISTS print_ready_pdf_paths jsonb;

COMMENT ON COLUMN public.order_jobs.print_ready_pdf_paths IS
  'Ordered array of print-ready PDF storage paths, one per canvas for canvas_wrap jobs. Order matches spec.canvas_prints.canvases[]. First entry is also mirrored to print_ready_pdf_path.';