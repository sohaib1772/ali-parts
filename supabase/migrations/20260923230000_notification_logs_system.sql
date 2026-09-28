-- Migration: notification_logs_system
-- Purpose: Create notification_logs table, auditing RPCs, and enhanced device token registration with failure logging.

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  platform text,
  device_model text,
  os_version text,
  app_version text,
  token_preview text,
  title text,
  message text,
  error_details text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_notif_logs_created_at ON public.notification_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_logs_user_id ON public.notification_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_status ON public.notification_logs (status);
CREATE INDEX IF NOT EXISTS idx_notif_logs_platform ON public.notification_logs (platform);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event_type ON public.notification_logs (event_type);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view all notification logs" ON public.notification_logs;
CREATE POLICY "admins view all notification logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') = true);

DROP POLICY IF EXISTS "users insert own notification logs" ON public.notification_logs;
CREATE POLICY "users insert own notification logs" ON public.notification_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ---------------------------------------------------------------------------
-- Generic RPC: log_notification_event
-- Callable by client (even anon/splash phase) to log APNs/FCM errors or device status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_notification_event(
  p_event_type text,
  p_status text DEFAULT 'info',
  p_platform text DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_error_details text DEFAULT NULL,
  p_device_info jsonb DEFAULT '{}'::jsonb,
  p_token_preview text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_log_id uuid;
  v_model text;
  v_os text;
  v_app_ver text;
BEGIN
  v_model := p_device_info ->> 'device_model';
  v_os := p_device_info ->> 'os_version';
  v_app_ver := p_device_info ->> 'app_version';

  INSERT INTO public.notification_logs (
    user_id, event_type, status, platform, device_model, os_version, app_version,
    token_preview, title, message, error_details, metadata
  ) VALUES (
    v_uid,
    p_event_type,
    coalesce(p_status, 'info'),
    p_platform,
    v_model,
    v_os,
    v_app_ver,
    p_token_preview,
    p_title,
    p_message,
    p_error_details,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_notification_event(text, text, text, text, text, text, jsonb, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_notification_event(text, text, text, text, text, text, jsonb, text, jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enhanced register_device_token: logs success, failure, and device details
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_device_token(text, text);
DROP FUNCTION IF EXISTS public.register_device_token(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token text,
  p_platform text,
  p_device_info jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_preview text;
  v_plat text;
  v_model text;
  v_os text;
  v_app_ver text;
BEGIN
  v_plat := coalesce(nullif(btrim(p_platform), ''), 'android');
  v_model := p_device_info ->> 'device_model';
  v_os := p_device_info ->> 'os_version';
  v_app_ver := p_device_info ->> 'app_version';

  IF coalesce(btrim(p_token), '') = '' THEN
    INSERT INTO public.notification_logs (
      user_id, event_type, status, platform, device_model, os_version, app_version,
      title, message, error_details, metadata
    ) VALUES (
      v_uid, 'token_registration_failed', 'failure', v_plat, v_model, v_os, v_app_ver,
      'فشل تسجيل التوكن: رمز فارغ', 'حاول الجهاز تسجيل رمز إشعار فارغ.', 'Token is empty',
      p_device_info
    );
    RAISE EXCEPTION 'token required';
  END IF;

  v_preview := CASE 
    WHEN length(p_token) > 14 THEN substr(p_token, 1, 8) || '...' || substr(p_token, length(p_token) - 5)
    ELSE substr(p_token, 1, 8)
  END;

  IF v_uid IS NULL THEN
    INSERT INTO public.notification_logs (
      user_id, event_type, status, platform, device_model, os_version, app_version,
      token_preview, title, message, error_details, metadata
    ) VALUES (
      NULL, 'token_registration_failed', 'failure', v_plat, v_model, v_os, v_app_ver,
      v_preview, 'فشل تسجيل التوكن: غير مسجل دخول',
      'تم رفض حفظ التوكن لأن المستخدم لم يسجل دخوله بعد في التطبيق.',
      'must be signed in to register a device token (auth.uid is null)',
      p_device_info
    );
    RAISE EXCEPTION 'must be signed in to register a device token' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform, last_seen)
  VALUES (v_uid, p_token, v_plat, now())
  ON CONFLICT (token) DO UPDATE
    SET user_id   = v_uid,
        platform  = EXCLUDED.platform,
        last_seen = now();

  -- Log success
  INSERT INTO public.notification_logs (
    user_id, event_type, status, platform, device_model, os_version, app_version,
    token_preview, title, message, metadata
  ) VALUES (
    v_uid, 'token_registered', 'success', v_plat, v_model, v_os, v_app_ver,
    v_preview,
    'حفظ توكن جهاز ' || CASE WHEN v_plat = 'ios' THEN 'iPhone' WHEN v_plat = 'android' THEN 'Android' ELSE 'المتصفح' END,
    'تم تسجيل توكن الجهاز وتحديثه بنجاح في قاعدة البيانات.',
    p_device_info
  );
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%token required%' AND SQLERRM NOT LIKE '%must be signed in%' THEN
    INSERT INTO public.notification_logs (
      user_id, event_type, status, platform, device_model, os_version, app_version,
      title, message, error_details, metadata
    ) VALUES (
      v_uid, 'token_registration_failed', 'failure', v_plat, v_model, v_os, v_app_ver,
      'خطأ استثنائي أثناء حفظ التوكن', 'حدث خطأ في قاعدة البيانات أثناء حفظ التوكن.', SQLERRM,
      p_device_info
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, jsonb) TO authenticated;
