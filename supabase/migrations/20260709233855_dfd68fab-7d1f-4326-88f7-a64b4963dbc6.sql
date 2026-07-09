DROP POLICY IF EXISTS "Anon read comments" ON public.banner_comments;
REVOKE SELECT ON public.banner_comments FROM anon;