REVOKE EXECUTE ON FUNCTION public.add_banner_comment(uuid, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_banner_comment(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_banner_comment(uuid, text, boolean) TO authenticated;