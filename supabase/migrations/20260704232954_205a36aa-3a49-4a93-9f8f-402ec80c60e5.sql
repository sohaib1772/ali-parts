
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.banner_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id UUID NOT NULL REFERENCES public.banners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.banner_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  is_admin_reply BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.banner_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banner_comments TO authenticated;
GRANT ALL ON public.banner_comments TO service_role;

ALTER TABLE public.banner_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comments" ON public.banner_comments
  FOR SELECT USING (true);

CREATE POLICY "Auth users insert own comments" ON public.banner_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (is_admin_reply = false OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users update own comments" ON public.banner_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own or admin any" ON public.banner_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_banner_comments_banner ON public.banner_comments(banner_id, created_at DESC);

CREATE TRIGGER trg_banner_comments_updated
  BEFORE UPDATE ON public.banner_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.banner_likes (
  banner_id UUID NOT NULL REFERENCES public.banners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (banner_id, user_id)
);

GRANT SELECT ON public.banner_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.banner_likes TO authenticated;
GRANT ALL ON public.banner_likes TO service_role;

ALTER TABLE public.banner_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads likes" ON public.banner_likes
  FOR SELECT USING (true);

CREATE POLICY "User inserts own like" ON public.banner_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User deletes own like" ON public.banner_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
