-- Prevent tenant/branch sender accounts from using the platform mailbox address.
CREATE OR REPLACE FUNCTION public.enforce_email_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_tenant_id uuid;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.tenant_id INTO v_branch_tenant_id
    FROM public.branches b
    WHERE b.id = NEW.branch_id;

    IF v_branch_tenant_id IS NULL THEN
      RAISE EXCEPTION 'email account branch does not exist';
    END IF;

    IF NEW.tenant_id IS NULL OR NEW.tenant_id <> v_branch_tenant_id THEN
      RAISE EXCEPTION 'branch email account tenant mismatch';
    END IF;
  END IF;

  IF NEW.is_active
     AND (NEW.tenant_id IS NOT NULL OR NEW.branch_id IS NOT NULL)
     AND lower(NEW.from_email) = 'hello@document-centre.com' THEN
    RAISE EXCEPTION 'platform sender cannot be used for tenant or branch email';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_email_account_scope ON public.email_accounts;
CREATE TRIGGER trg_enforce_email_account_scope
BEFORE INSERT OR UPDATE OF tenant_id, branch_id, from_email, is_active
ON public.email_accounts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_email_account_scope();

-- Prevent outbox rows from explicitly pointing branch/tenant mail at a platform sender.
CREATE OR REPLACE FUNCTION public.enforce_email_outbox_account_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account record;
BEGIN
  IF NEW.email_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, tenant_id, branch_id
  INTO v_account
  FROM public.email_accounts
  WHERE id = NEW.email_account_id;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'email account does not exist';
  END IF;

  IF NEW.tenant_id IS NULL AND NEW.branch_id IS NULL THEN
    IF v_account.tenant_id IS NOT NULL OR v_account.branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'platform email cannot use a tenant or branch sender';
    END IF;
    RETURN NEW;
  END IF;

  IF v_account.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant or branch email cannot use a platform sender';
  END IF;

  IF NEW.tenant_id IS NOT NULL AND v_account.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'email account tenant mismatch';
  END IF;

  IF v_account.branch_id IS NOT NULL THEN
    IF NEW.branch_id IS NULL OR v_account.branch_id <> NEW.branch_id THEN
      RAISE EXCEPTION 'email account branch mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_email_outbox_account_scope ON public.email_outbox;
CREATE TRIGGER trg_enforce_email_outbox_account_scope
BEFORE INSERT OR UPDATE OF tenant_id, branch_id, email_account_id
ON public.email_outbox
FOR EACH ROW
EXECUTE FUNCTION public.enforce_email_outbox_account_scope();

-- Keep historical rows but stop any tenant/branch scoped hello@ sender from being selected again.
UPDATE public.email_accounts
SET
  is_active = false,
  is_default = false,
  last_error = 'Disabled: platform sender cannot be used for tenant or branch email',
  updated_at = now()
WHERE lower(from_email) = 'hello@document-centre.com'
  AND (tenant_id IS NOT NULL OR branch_id IS NOT NULL);