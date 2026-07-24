-- Admin broadcast notifications (in-app layer).
--
-- Lets an admin send one notification row per recipient, reusing the existing
-- fan-out shape from notify_new_banner():
--     INSERT INTO notifications (user_id, type, title, body) SELECT ... FROM profiles
--
-- Why SECURITY DEFINER and not a client insert: public.notifications has RLS
-- enabled with SELECT/UPDATE/DELETE policies but NO INSERT POLICY AT ALL, so no
-- client role can ever insert. Every existing writer is a SECURITY DEFINER
-- trigger. This keeps that invariant — the API surface is these functions, not
-- the table.
--
-- `notifications.type` is plain `text` with default 'order_status' and NO check
-- constraint or enum, so adding 'admin_broadcast' needs no constraint change.

-- ---------------------------------------------------------------------------
-- 1. Audience resolution — THE single extension point for targeting.
--
-- Adding a new audience later (recent buyers, one user, a city) means adding one
-- branch here; neither the send function nor the UI contract changes shape.
-- Deliberately NOT granted to any client role: it is an internal helper, and the
-- SECURITY DEFINER callers below run as the owner so they can still reach it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_broadcast_recipients(
  p_audience text DEFAULT 'all_customers',
  p_user_id  uuid DEFAULT NULL
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_audience = 'all_customers' THEN
    -- "Customers" excludes admins so the count shown in the UI ("N عميل") is
    -- truthful and an admin testing the feature does not inflate it.
    RETURN QUERY
      SELECT p.id FROM public.profiles p
      WHERE NOT public.has_role(p.id, 'admin');

  ELSIF p_audience = 'all_users' THEN
    RETURN QUERY SELECT p.id FROM public.profiles p;

  ELSIF p_audience = 'single_user' THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'audience single_user requires p_user_id';
    END IF;
    RETURN QUERY SELECT p.id FROM public.profiles p WHERE p.id = p_user_id;

  ELSE
    -- Loud, not silent. A typo must not quietly resolve to "nobody".
    RAISE EXCEPTION 'unknown audience: %', p_audience;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Recipient count — drives the pre-send confirmation in the admin UI.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_broadcast_audience_count(
  p_audience text DEFAULT 'all_customers',
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

-- ---------------------------------------------------------------------------
-- 3. The send path.
--
-- Returns the number of rows actually inserted, so the UI reports a real count
-- rather than the pre-send estimate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title    text,
  p_body     text,
  p_audience text DEFAULT 'all_customers',
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
  -- Authorization lives HERE, not only in the server function that calls it.
  -- auth.uid() is the caller's JWT subject, so this holds even if someone calls
  -- the RPC directly with a signed-in non-admin token.
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

  -- Resolve the audience BEFORE the cooldown check so an unknown audience fails
  -- as an unknown audience. Validating after would report a stale "you just sent
  -- one" error for what is really a malformed request.
  SELECT count(*) INTO v_expected
  FROM public.admin_broadcast_recipients(p_audience, p_user_id);

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'لا يوجد مستلمون لهذه الشريحة';
  END IF;

  -- Double-send guard. The UI also disables its button while in flight, but that
  -- cannot survive a double-submit from two tabs or a retried request, and this
  -- writes one row per customer — so the real guard is here.
  SELECT count(*) INTO v_recent
  FROM public.notifications
  WHERE type = 'admin_broadcast'
    AND created_at > now() - interval '60 seconds';

  IF v_recent > 0 THEN
    RAISE EXCEPTION 'تم إرسال إشعار جماعي قبل أقل من دقيقة. انتظر قليلاً ثم حاول مرة أخرى.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body)
  SELECT r.user_id, 'admin_broadcast', v_title, nullif(v_body, '')
  FROM public.admin_broadcast_recipients(p_audience, p_user_id) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Supports the 60-second cooldown probe without scanning the notifications
-- table as broadcast history grows.
CREATE INDEX IF NOT EXISTS idx_notifications_admin_broadcast_created
  ON public.notifications (created_at DESC)
  WHERE type = 'admin_broadcast';

-- ---------------------------------------------------------------------------
-- 4. Grants. anon can reach none of these; the two admin-gated entry points are
-- callable by authenticated and refuse non-admins internally.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_broadcast_recipients(text, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_broadcast_audience_count(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_audience_count(text, uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, uuid)
  TO authenticated;
