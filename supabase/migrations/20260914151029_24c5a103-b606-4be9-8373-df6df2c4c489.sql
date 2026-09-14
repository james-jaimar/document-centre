
REVOKE ALL ON FUNCTION public.enforce_customer_trade_consistency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.propagate_customer_trade_flag() FROM PUBLIC, anon, authenticated;
