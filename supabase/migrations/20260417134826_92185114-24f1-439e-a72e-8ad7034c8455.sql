-- 1. customer_notes table
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  customer_profile_id uuid NOT NULL,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer
  ON public.customer_notes (tenant_id, customer_profile_id, created_at DESC);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_notes_select_staff"
  ON public.customer_notes FOR SELECT
  USING (public.user_is_staff_for(app_id, tenant_id));

CREATE POLICY "customer_notes_insert_staff"
  ON public.customer_notes FOR INSERT
  WITH CHECK (public.user_is_staff_for(app_id, tenant_id) AND created_by = auth.uid());

CREATE POLICY "customer_notes_update_staff"
  ON public.customer_notes FOR UPDATE
  USING (public.user_is_staff_for(app_id, tenant_id))
  WITH CHECK (public.user_is_staff_for(app_id, tenant_id));

CREATE POLICY "customer_notes_delete_staff"
  ON public.customer_notes FOR DELETE
  USING (public.user_is_staff_for(app_id, tenant_id));

CREATE TRIGGER trg_customer_notes_updated_at
  BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Backfill tenant_memberships for past order placers
INSERT INTO public.tenant_memberships (profile_id, tenant_id, app_id, role, is_active)
SELECT DISTINCT o.ordered_by_profile_id, o.tenant_id, o.app_id, 'customer', true
FROM public.orders o
WHERE o.ordered_by_profile_id IS NOT NULL
  AND o.tenant_id IS NOT NULL
  AND o.app_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.profile_id = o.ordered_by_profile_id
      AND tm.tenant_id = o.tenant_id
      AND tm.app_id = o.app_id
  );