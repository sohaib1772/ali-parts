-- FCM push: device token storage + a single dispatch hook for every notification.
--
-- Design decision (see task section 5): EVERY in-app notification — order
-- created/status, replacement status, new banner, admin broadcast, block/unblock
-- — is written to public.notifications by some path (a trigger, the
-- admin_broadcast_notification function, or the block server function). So the
-- DRY hook is ONE AFTER INSERT trigger on public.notifications, not a change to
-- each of those paths. Push then mirrors in-app automatically and can never drift
-- from it.
--
-- Transport reuses the EXISTING pattern already in this database
-- (dispatch_replacement_push): read an endpoint + shared secret from
-- app_settings and POST to it. The one correction is the extension: we use
-- net.http_post (pg_net, ASYNC) — the sync `extensions.http_post` that
-- dispatch_replacement_push references does not exist on this instance, which is
-- why that older path never worked. Async is also what makes a broadcast safe:
-- the INSERT ... SELECT that writes N broadcast rows fires this trigger N times,
-- but each call only ENQUEUES an HTTP request in pg_net's queue and returns
-- immediately, so the admin's request commits without waiting on any FCM I/O.
-- pg_net's background worker drains the queue at its own rate — the throttle.

-- ---------------------------------------------------------------------------
-- 1. device_tokens — one row per (device) FCM token.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  platform   text NOT NULL DEFAULT 'android',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens (user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- A user manages ONLY their own tokens. The upsert below runs as the signed-in
-- user, so both the INSERT and the reassigning UPDATE must pass WITH CHECK.
DROP POLICY IF EXISTS "users manage own device tokens" ON public.device_tokens;
CREATE POLICY "users manage own device tokens" ON public.device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins may read all tokens (parity with push_subscriptions, useful for support
-- and for a future admin-side send). No admin write policy — writes are the
-- device's own, or the service role (which bypasses RLS) during cleanup.
DROP POLICY IF EXISTS "admins view all device tokens" ON public.device_tokens;
CREATE POLICY "admins view all device tokens" ON public.device_tokens
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 2. Reassign-safe upsert. Called from the client with the signed-in user's
--    JWT. ON CONFLICT (token) reassigns the row to the current user, which is
--    exactly the shared-device / re-login case: the token stays unique and
--    follows whoever is now signed in on that device. Token refresh is the same
--    upsert with the same user.
--
--    Why a SECURITY DEFINER function rather than a raw client upsert: when a
--    token currently belongs to user A and user B signs in on the same device,
--    B's RLS (auth.uid()=user_id) cannot UPDATE A's row. This function performs
--    the reassignment as owner, but pins user_id to auth.uid() so a caller can
--    still only ever claim a token FOR THEMSELVES.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token    text,
  p_platform text DEFAULT 'android'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'must be signed in to register a device token' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(p_token), '') = '' THEN
    RAISE EXCEPTION 'token required';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform, last_seen)
  VALUES (v_uid, p_token, coalesce(nullif(btrim(p_platform), ''), 'android'), now())
  ON CONFLICT (token) DO UPDATE
    SET user_id   = v_uid,          -- reassign to whoever holds the device now
        platform  = EXCLUDED.platform,
        last_seen = now();
END;
$$;

REVOKE ALL ON FUNCTION public.register_device_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The single dispatch hook: notifications AFTER INSERT -> async HTTP POST.
--
-- Config is read from app_settings so the endpoint/secret are set once, out of
-- band, and can be rotated without a migration:
--     key 'fcm_dispatch' -> {"endpoint":"https://maktabali.com/api/internal/fcm-dispatch"}
--     key 'fcm_dispatch_secret' -> {"secret":"<random>"}   (jsonb, mirrors push_config shape)
--
-- Until BOTH exist this is a pure no-op, so the migration is safe to ship BEFORE
-- the endpoint is deployed or the secret is set. Nothing about the in-app write
-- path can be broken by this trigger: any failure to enqueue is swallowed so a
-- push transport hiccup can never roll back the notification insert itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_endpoint text;
  v_secret   text;
BEGIN
  SELECT (value::jsonb) ->> 'endpoint' INTO v_endpoint
    FROM public.app_settings WHERE key = 'fcm_dispatch';
  SELECT (value::jsonb) ->> 'secret' INTO v_secret
    FROM public.app_settings WHERE key = 'fcm_dispatch_secret';

  IF v_endpoint IS NULL OR v_secret IS NULL THEN
    RETURN NEW;  -- not configured yet: no-op
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_endpoint,
      body    := jsonb_build_object('notification_id', NEW.id, 'secret', v_secret),
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a push-enqueue failure roll back the in-app notification.
    RAISE WARNING 'dispatch_notification_push enqueue failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_notification_push ON public.notifications;
CREATE TRIGGER trg_dispatch_notification_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_notification_push();
