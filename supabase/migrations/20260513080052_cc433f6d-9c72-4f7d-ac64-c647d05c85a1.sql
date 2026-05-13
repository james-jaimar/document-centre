
CREATE TYPE public.production_status AS ENUM ('pending', 'ready_to_print', 'printing', 'printed', 'binding', 'finishing', 'done');

CREATE TABLE public.order_item_production (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE CASCADE,
  status production_status NOT NULL DEFAULT 'pending',
  printed_at TIMESTAMPTZ,
  bound_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  operator_id UUID,
  notes TEXT,
  print_ready_pdf_path TEXT,
  imposed_pdf_path TEXT,
  job_ticket_pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_item_production_status ON public.order_item_production(status);

ALTER TABLE public.order_item_production ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tenant_id_for_order_item(_item_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.tenant_id
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = _item_id
$$;

CREATE POLICY "Production roles can view"
  ON public.order_item_production FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = public.tenant_id_for_order_item(order_item_id)
        AND tm.is_active = true
        AND tm.role IN ('owner','admin','production')
    )
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE POLICY "Production roles can insert"
  ON public.order_item_production FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = public.tenant_id_for_order_item(order_item_id)
        AND tm.is_active = true
        AND tm.role IN ('owner','admin','production')
    )
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE POLICY "Production roles can update"
  ON public.order_item_production FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.profile_id = auth.uid()
        AND tm.tenant_id = public.tenant_id_for_order_item(order_item_id)
        AND tm.is_active = true
        AND tm.role IN ('owner','admin','production')
    )
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE TRIGGER trg_order_item_production_updated
  BEFORE UPDATE ON public.order_item_production
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
