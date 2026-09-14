
CREATE OR REPLACE FUNCTION public.enforce_customer_trade_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade boolean;
  v_acct text;
  v_terms text;
BEGIN
  IF NEW.role IS DISTINCT FROM 'customer' OR NEW.profile_id IS NULL OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND COALESCE(NEW.is_trade_customer, false) = false THEN
    SELECT bool_or(COALESCE(m.is_trade_customer, false)),
           max(m.mis_account_number) FILTER (WHERE m.mis_account_number IS NOT NULL),
           max(m.payment_terms_mode) FILTER (WHERE m.payment_terms_mode IS NOT NULL)
      INTO v_trade, v_acct, v_terms
      FROM public.tenant_memberships m
     WHERE m.profile_id = NEW.profile_id
       AND m.tenant_id = NEW.tenant_id
       AND m.role = 'customer'
       AND m.is_active;

    IF COALESCE(v_trade, false) THEN
      NEW.is_trade_customer := true;
      NEW.mis_account_number := COALESCE(NEW.mis_account_number, v_acct);
      NEW.payment_terms_mode := COALESCE(NEW.payment_terms_mode, v_terms);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_trade_inherit ON public.tenant_memberships;
CREATE TRIGGER trg_customer_trade_inherit
BEFORE INSERT ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_trade_consistency();

CREATE OR REPLACE FUNCTION public.propagate_customer_trade_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM 'customer' OR NEW.profile_id IS NULL OR NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.is_trade_customer IS DISTINCT FROM OLD.is_trade_customer THEN
    UPDATE public.tenant_memberships m
       SET is_trade_customer = NEW.is_trade_customer
     WHERE m.profile_id = NEW.profile_id
       AND m.tenant_id = NEW.tenant_id
       AND m.role = 'customer'
       AND m.is_active
       AND m.id <> NEW.id
       AND m.is_trade_customer IS DISTINCT FROM NEW.is_trade_customer;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_trade_propagate ON public.tenant_memberships;
CREATE TRIGGER trg_customer_trade_propagate
AFTER UPDATE OF is_trade_customer ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.propagate_customer_trade_flag();

-- Repair any existing conflicting records: if any active customer membership
-- in a tenant is trade, every active membership for that person becomes trade.
UPDATE public.tenant_memberships m
   SET is_trade_customer = true
  FROM (
    SELECT profile_id, tenant_id
      FROM public.tenant_memberships
     WHERE role = 'customer' AND is_active
     GROUP BY profile_id, tenant_id
    HAVING bool_or(COALESCE(is_trade_customer, false))
       AND bool_or(NOT COALESCE(is_trade_customer, false))
  ) conflicted
 WHERE m.profile_id = conflicted.profile_id
   AND m.tenant_id = conflicted.tenant_id
   AND m.role = 'customer'
   AND m.is_active
   AND COALESCE(m.is_trade_customer, false) = false;
