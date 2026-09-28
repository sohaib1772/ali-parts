-- Migration: banner_comment_notifications
-- Automatically creates notifications on public.notifications when comments or replies are added to banners.
-- Triggers trg_dispatch_notification_push on public.notifications which pushes to FCM.

CREATE OR REPLACE FUNCTION public.notify_banner_comment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commenter_name text := 'مستخدم';
  v_banner_title text := 'العرض';
  v_parent_user_id uuid;
  v_preview text;
  v_recent integer := 0;
BEGIN
  -- 1. Determine commenter display name
  IF NEW.is_admin_reply THEN
    v_commenter_name := 'مكتب علي شوفرليت';
  ELSE
    SELECT COALESCE(full_name, 'مستخدم')
    INTO v_commenter_name
    FROM public.profiles
    WHERE id = NEW.user_id;
  END IF;

  -- 2. Determine banner title
  SELECT COALESCE(title_ar, 'العرض')
  INTO v_banner_title
  FROM public.banners
  WHERE id = NEW.banner_id;

  -- 3. Trim preview
  v_preview := LEFT(NEW.content, 60);

  -- 4. If this is a REPLY (parent_id IS NOT NULL)
  IF NEW.parent_id IS NOT NULL THEN
    SELECT user_id
    INTO v_parent_user_id
    FROM public.banner_comments
    WHERE id = NEW.parent_id;

    -- If parent comment exists and parent commenter is NOT the one replying
    IF v_parent_user_id IS NOT NULL AND v_parent_user_id <> NEW.user_id THEN
      -- Dedup guard (15 seconds)
      SELECT count(*) INTO v_recent
      FROM public.notifications
      WHERE user_id = v_parent_user_id
        AND type = 'banner_reply'
        AND status = NEW.banner_id::text
        AND created_at > now() - interval '15 seconds';

      IF v_recent = 0 THEN
        INSERT INTO public.notifications (user_id, type, title, body, status)
        VALUES (
          v_parent_user_id,
          'banner_reply',
          CASE WHEN NEW.is_admin_reply THEN 'رد من مكتب علي شوفرليت' ELSE 'رد جديد على تعليقك' END,
          v_commenter_name || ': "' || v_preview || '"',
          NEW.banner_id::text
        );
      END IF;
    END IF;

  -- 5. Otherwise this is a TOP-LEVEL comment (parent_id IS NULL)
  ELSE
    -- If a customer posted (not office reply), notify all admins & staff
    IF NOT NEW.is_admin_reply THEN
      INSERT INTO public.notifications (user_id, type, title, body, status)
      SELECT DISTINCT u.user_id,
        'banner_comment',
        'تعليق جديد على ' || v_banner_title,
        v_commenter_name || ': "' || v_preview || '"',
        NEW.banner_id::text
      FROM (
        SELECT user_id FROM public.user_roles WHERE role = 'admin'
        UNION
        SELECT user_id FROM public.staff_permissions
      ) u
      WHERE u.user_id <> NEW.user_id
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = u.user_id
            AND n.type = 'banner_comment'
            AND n.status = NEW.banner_id::text
            AND n.created_at > now() - interval '15 seconds'
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_banner_comment_created() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_banner_comment_created() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_banner_comment_created ON public.banner_comments;
CREATE TRIGGER trg_notify_banner_comment_created
  AFTER INSERT ON public.banner_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_banner_comment_created();
