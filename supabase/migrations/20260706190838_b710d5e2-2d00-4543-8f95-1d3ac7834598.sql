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

  SELECT (value::jsonb)->>'endpoint' INTO v_endpoint FROM public.app_settings WHERE key = 'push_config';
  SELECT (value::jsonb)->>'secret' INTO v_secret FROM public.app_settings WHERE key = 'push_trigger_secret';

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