CREATE OR REPLACE FUNCTION public.add_banner_comment(
  p_banner_id uuid,
  p_content text,
  p_is_admin_reply boolean DEFAULT false
)
RETURNS public.banner_comments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_content text := NULLIF(btrim(COALESCE(p_content, '')), '');
  v_is_admin_reply boolean := COALESCE(p_is_admin_reply, false);
  v_blocked boolean := false;
  v_row public.banner_comments;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_content IS NULL OR char_length(v_content) > 1000 THEN
    RAISE EXCEPTION 'Invalid comment';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.banners b
    WHERE b.id = p_banner_id
      AND b.is_active = true
      AND (b.expires_at IS NULL OR b.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Banner not available';
  END IF;

  SELECT COALESCE(p.is_blocked, false)
  INTO v_blocked
  FROM public.profiles p
  WHERE p.id = v_user;

  IF COALESCE(v_blocked, false) THEN
    RAISE EXCEPTION 'حسابك محظور من التعليق بسبب مخالفة سابقة.';
  END IF;

  IF v_is_admin_reply AND NOT public.has_role(v_user, 'admin') THEN
    v_is_admin_reply := false;
  END IF;

  INSERT INTO public.banner_comments (banner_id, user_id, content, is_admin_reply)
  VALUES (p_banner_id, v_user, v_content, v_is_admin_reply)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.add_banner_comment(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_banner_comment(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_banner_comment(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_banner_comment(uuid, text, boolean) TO service_role;