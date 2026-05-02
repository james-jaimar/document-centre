-- Fix upload_sessions FK: was pointing to order_jobs, should point to order_items
ALTER TABLE public.upload_sessions
  DROP CONSTRAINT IF EXISTS upload_sessions_order_item_id_fkey;

ALTER TABLE public.upload_sessions
  ADD CONSTRAINT upload_sessions_order_item_id_fkey
  FOREIGN KEY (order_item_id)
  REFERENCES public.order_items(id)
  ON DELETE CASCADE;