CREATE OR REPLACE FUNCTION public.sync_account_ledger_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  charge public.customer_account_ledger%ROWTYPE;
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.metadata->>'source', '') = 'account_ledger' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO charge
  FROM public.customer_account_ledger
  WHERE order_id = NEW.order_id AND entry_type = 'charge'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_account_ledger (
    tenant_id, app_id, branch_id, company_id, customer_profile_id,
    entry_type, amount, currency, order_id, reference, note, entry_date
  ) VALUES (
    charge.tenant_id, charge.app_id, charge.branch_id, charge.company_id, charge.customer_profile_id,
    'payment', -ABS(NEW.amount), NEW.currency, NEW.order_id,
    NEW.payment_reference, 'Payment received for ' || COALESCE(charge.reference, 'order'),
    COALESCE(NEW.paid_at::date, CURRENT_DATE)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_ledger_on_payment ON public.payments;
CREATE TRIGGER trg_account_ledger_on_payment
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_ledger_from_payment();

CREATE OR REPLACE FUNCTION public.reverse_account_charge_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  charge public.customer_account_ledger%ROWTYPE;
BEGIN
  IF NEW.admin_status IS NOT DISTINCT FROM OLD.admin_status THEN
    RETURN NEW;
  END IF;
  IF NEW.admin_status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO charge
  FROM public.customer_account_ledger
  WHERE order_id = NEW.id AND entry_type = 'charge'
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_account_ledger
    WHERE order_id = NEW.id AND entry_type = 'credit_note'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customer_account_ledger (
    tenant_id, app_id, branch_id, company_id, customer_profile_id,
    entry_type, amount, currency, order_id, reference, note, entry_date
  ) VALUES (
    charge.tenant_id, charge.app_id, charge.branch_id, charge.company_id, charge.customer_profile_id,
    'credit_note', -ABS(charge.amount), charge.currency, NEW.id,
    charge.reference, 'Order cancelled', CURRENT_DATE
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_ledger_on_cancel ON public.orders;
CREATE TRIGGER trg_account_ledger_on_cancel
  AFTER UPDATE OF admin_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.reverse_account_charge_on_cancel();

REVOKE EXECUTE ON FUNCTION public.sync_account_ledger_from_payment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_account_charge_on_cancel() FROM anon, authenticated;