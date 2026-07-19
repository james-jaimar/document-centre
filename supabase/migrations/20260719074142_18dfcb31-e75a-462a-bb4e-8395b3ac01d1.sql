REVOKE EXECUTE ON FUNCTION public.user_can_insert_order_item_for_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_insert_order_item_for_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_can_insert_order_item_for_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_insert_order_item_for_order(uuid) TO service_role;