
-- Revoke anonymous EXECUTE from SECURITY DEFINER functions that were
-- unintentionally callable by the `anon` role. All of these are either
-- trigger functions (never called directly) or admin-only helpers that
-- perform their own auth checks. None require public access.

REVOKE EXECUTE ON FUNCTION public.app_settings_recalc_on_rate_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_banner_created() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_order_created() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_order_status_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_replacement_status_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audit_user_block() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_all_products_iqd() FROM PUBLIC, anon;
