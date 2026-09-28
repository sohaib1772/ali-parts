-- Migration: fix_banner_comments_rls
-- 1. Default user_id to auth.uid() if omitted
ALTER TABLE public.banner_comments 
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Update insert policy to allow staff and admin to post office replies (is_admin_reply = true)
DROP POLICY IF EXISTS "Auth users insert own comments" ON public.banner_comments;

CREATE POLICY "Auth users insert own comments" ON public.banner_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      is_admin_reply = false OR 
      public.has_role(auth.uid(), 'admin') OR 
      public.is_staff(auth.uid())
    )
  );

-- 3. Ensure staff can delete comments if they have staff permissions or are admin
DROP POLICY IF EXISTS "staff delete banner comments" ON public.banner_comments;

CREATE POLICY "staff delete banner comments" ON public.banner_comments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.is_staff(auth.uid())
  );
