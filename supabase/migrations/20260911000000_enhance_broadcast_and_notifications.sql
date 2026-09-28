-- Migration: Enhance notifications realtime, broadcast defaults, and app versioning settings

-- 1. Ensure full replica identity on notifications for reliable Realtime delivery
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 2. Update default audience in admin_broadcast_recipients and admin_broadcast_notification
CREATE OR REPLACE FUNCTION public.admin_broadcast_recipients(
  p_audience text DEFAULT 'all_users',
  p_user_id  uuid DEFAULT NULL
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_audience = 'all_users' THEN
    RETURN QUERY SELECT p.id FROM public.profiles p;

  ELSIF p_audience = 'all_customers' THEN
    RETURN QUERY
      SELECT p.id FROM public.profiles p
      WHERE NOT public.has_role(p.id, 'admin');

  ELSIF p_audience = 'single_user' THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'audience single_user requires p_user_id';
    END IF;
    RETURN QUERY SELECT p.id FROM public.profiles p WHERE p.id = p_user_id;

  ELSE
    RAISE EXCEPTION 'unknown audience: %', p_audience;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_audience_count(
  p_audience text DEFAULT 'all_users',
  p_user_id  uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.admin_broadcast_recipients(p_audience, p_user_id);

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title    text,
  p_body     text,
  p_audience text DEFAULT 'all_users',
  p_user_id  uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title    text := btrim(coalesce(p_title, ''));
  v_body     text := btrim(coalesce(p_body, ''));
  v_count    integer;
  v_expected integer;
  v_recent   integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'العنوان مطلوب';
  END IF;
  IF length(v_title) > 80 THEN
    RAISE EXCEPTION 'العنوان يتجاوز 80 حرفاً';
  END IF;
  IF length(v_body) > 300 THEN
    RAISE EXCEPTION 'النص يتجاوز 300 حرف';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.admin_broadcast_recipients(p_audience, p_user_id);

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'لا يوجد مستلمون لهذه الشريحة';
  END IF;

  -- 10-second double-send cooldown
  SELECT count(*) INTO v_recent
  FROM public.notifications
  WHERE type = 'admin_broadcast'
    AND created_at > now() - interval '10 seconds';

  IF v_recent > 0 THEN
    RAISE EXCEPTION 'تم إرسال إشعار جماعي قبل لحظات. انتظر قليلاً ثم حاول مرة أخرى.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body)
  SELECT r.user_id, 'admin_broadcast', v_title, nullif(v_body, '')
  FROM public.admin_broadcast_recipients(p_audience, p_user_id) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 3. Seed Force Update App Settings
INSERT INTO public.app_settings (key, value) VALUES
  ('min_app_version_android', '1.0.0'),
  ('min_app_version_ios',     '1.0.0'),
  ('force_update_message',    'يتوفر تحديث جديد ومهم للتطبيق يحتوي على تحسينات ومميزات جديدة. يرجى التحديث للمتابعة.'),
  ('app_store_url',           'https://apps.apple.com/app/id6741753177'),
  ('play_store_url',          'https://play.google.com/store/apps/details?id=com.mkteb.ali.chevrolet')
ON CONFLICT (key) DO NOTHING;
