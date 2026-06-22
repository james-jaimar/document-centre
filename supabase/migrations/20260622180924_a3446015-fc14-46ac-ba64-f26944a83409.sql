
-- 1. Create the private table
CREATE TABLE public.branch_private (
  branch_id uuid PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  legal_name text,
  vat_number text,
  registration_number text,
  billing_email text,
  accounts_email text,
  banking_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Backfill from branches
INSERT INTO public.branch_private (branch_id, legal_name, vat_number, registration_number, billing_email, accounts_email, banking_details)
SELECT id, legal_name, vat_number, registration_number, billing_email, accounts_email, COALESCE(banking_details, '{}'::jsonb)
FROM public.branches;

-- 3. Grants — no anon, no broad authenticated read
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_private TO authenticated;
GRANT ALL ON public.branch_private TO service_role;

-- 4. RLS
ALTER TABLE public.branch_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_private_select_admin"
  ON public.branch_private FOR SELECT TO authenticated
  USING (public.user_can_manage_branch(branch_id));

CREATE POLICY "branch_private_write_admin"
  ON public.branch_private FOR ALL TO authenticated
  USING (public.user_can_manage_branch(branch_id))
  WITH CHECK (public.user_can_manage_branch(branch_id));

-- 5. updated_at trigger
CREATE TRIGGER branch_private_set_updated_at
  BEFORE UPDATE ON public.branch_private
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Auto-create a private row whenever a branch is created
CREATE OR REPLACE FUNCTION public.ensure_branch_private()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.branch_private (branch_id) VALUES (NEW.id)
  ON CONFLICT (branch_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER branches_ensure_private
  AFTER INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.ensure_branch_private();

-- 7. Drop sensitive columns from branches
ALTER TABLE public.branches
  DROP COLUMN IF EXISTS legal_name,
  DROP COLUMN IF EXISTS vat_number,
  DROP COLUMN IF EXISTS registration_number,
  DROP COLUMN IF EXISTS billing_email,
  DROP COLUMN IF EXISTS accounts_email,
  DROP COLUMN IF EXISTS banking_details;
