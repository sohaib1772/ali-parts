-- Lock down SECURITY DEFINER functions: revoke public execute, grant only where needed
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_order(jsonb, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_sales_on_cancel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_points_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_order_points_redeem() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_product_sales() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_order_status_change() FROM PUBLIC, anon, authenticated;

-- Keep the RPCs the app actually needs
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text, integer, text) TO authenticated;