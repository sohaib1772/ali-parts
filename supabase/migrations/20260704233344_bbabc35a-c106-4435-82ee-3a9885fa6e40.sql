
DROP POLICY IF EXISTS "Anyone can read comments" ON public.banner_comments;
CREATE POLICY "Authenticated read comments" ON public.banner_comments
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.banner_comments FROM anon;

DROP POLICY IF EXISTS "Anyone reads likes" ON public.banner_likes;
CREATE POLICY "Authenticated read likes" ON public.banner_likes
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.banner_likes FROM anon;
