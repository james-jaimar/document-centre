CREATE TABLE public.message_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  app_id UUID,
  tenant_id UUID,
  branch_id UUID,
  order_id UUID,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_attachments_message ON public.message_attachments(message_id);
CREATE INDEX idx_message_attachments_order ON public.message_attachments(order_id);

GRANT SELECT ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_attachments_select_policy"
ON public.message_attachments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.messages m
  JOIN public.orders o ON o.id = m.order_id
  WHERE m.id = message_attachments.message_id
    AND (
      user_is_staff_for_branch(o.app_id, o.tenant_id, o.branch_id)
      OR (user_can_read_order(o.app_id, o.tenant_id, o.ordered_by_profile_id) AND m.is_internal = false)
    )
));