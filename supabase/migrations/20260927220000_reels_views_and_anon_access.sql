-- Migration: reels_views_and_anon_access
-- Purpose:
-- 1. Grant public/anon access to read banner likes and comments so unauthenticated users can see them.
-- 2. Add views_count, manual_views_count, and manual_likes_count to banners.
-- 3. Create increment_banner_views RPC for atomic view tracking.

-- 1. Table permissions for anon role
GRANT SELECT ON public.banner_likes TO anon;
GRANT SELECT ON public.banner_comments TO anon;
GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO anon;

-- Ensure RLS SELECT policies allow anon
DROP POLICY IF EXISTS "Anyone can read comments" ON public.banner_comments;
CREATE POLICY "Anyone can read comments" ON public.banner_comments
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone reads likes" ON public.banner_likes;
CREATE POLICY "Anyone reads likes" ON public.banner_likes
  FOR SELECT TO anon, authenticated
  USING (true);

-- 2. Add columns to banners
ALTER TABLE public.banners
  ADD COLUMN IF NOT EXISTS views_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_views_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_likes_count INT NOT NULL DEFAULT 0;

-- 3. Atomic increment function for views
CREATE OR REPLACE FUNCTION public.increment_banner_views(p_banner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.banners
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_banner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_banner_views(uuid) TO anon, authenticated, service_role;
