CREATE TABLE public.branch_pricing_import_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  filename text,
  row_count integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bpis_branch ON public.branch_pricing_import_snapshots(branch_id, applied_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.branch_pricing_import_snapshots TO authenticated;
GRANT ALL ON public.branch_pricing_import_snapshots TO service_role;

ALTER TABLE public.branch_pricing_import_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch managers read snapshots"
  ON public.branch_pricing_import_snapshots FOR SELECT TO authenticated
  USING (public.user_can_manage_branch(branch_id));

CREATE POLICY "branch managers insert snapshots"
  ON public.branch_pricing_import_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_branch(branch_id));

CREATE POLICY "branch managers update snapshots"
  ON public.branch_pricing_import_snapshots FOR UPDATE TO authenticated
  USING (public.user_can_manage_branch(branch_id))
  WITH CHECK (public.user_can_manage_branch(branch_id));