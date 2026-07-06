-- Enable pg_net for outbound HTTP from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins view all push subs"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_push_subs_updated
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Store the app base URL + trigger secret in app_settings so triggers can read them
INSERT INTO public.app_settings(key, value)
VALUES ('push_config', jsonb_build_object(
  'endpoint', 'https://ali-parts-pro.lovable.app/api/public/push/replacement-status'
))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Trigger that fires pg_net.http_post on replacement status change
CREATE OR REPLACE FUNCTION public.dispatch_replacement_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_endpoint text;
  v_secret text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT value->>'endpoint' INTO v_endpoint FROM public.app_settings WHERE key = 'push_config';
  SELECT value->>'secret' INTO v_secret FROM public.app_settings WHERE key = 'push_trigger_secret';

  IF v_endpoint IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := v_endpoint,
    body := jsonb_build_object('request_id', NEW.id, 'secret', v_secret),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_replacement_push ON public.replacement_requests;
CREATE TRIGGER trg_dispatch_replacement_push
  AFTER UPDATE OF status ON public.replacement_requests
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_replacement_push();