-- One-shot cleanup of orphan empty draft order_items (no documents, no sections)
-- and their parent orders if those orders end up empty.

WITH empty_items AS (
  SELECT oi.id AS item_id, oi.order_id
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.order_status = 'draft'
    AND oi.build_status = 'draft'
    AND oi.updated_at < now() - interval '1 hour'
    AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.order_item_id = oi.id)
    AND NOT EXISTS (SELECT 1 FROM public.document_sections ds WHERE ds.order_item_id = oi.id)
),
deleted_items AS (
  DELETE FROM public.order_items
  WHERE id IN (SELECT item_id FROM empty_items)
  RETURNING order_id
)
DELETE FROM public.orders o
WHERE o.id IN (SELECT DISTINCT order_id FROM deleted_items)
  AND o.order_status = 'draft'
  AND NOT EXISTS (SELECT 1 FROM public.order_items oi2 WHERE oi2.order_id = o.id);