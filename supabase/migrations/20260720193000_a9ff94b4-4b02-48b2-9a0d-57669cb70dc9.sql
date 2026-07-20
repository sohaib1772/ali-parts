-- Point the replacement-status push webhook away from the old Lovable domain.
--
-- app_settings.push_config held:
--   {"endpoint": "https://ali-parts-pro.lovable.app/api/public/push/replacement-status"}
-- That domain is no longer ours. public.dispatch_replacement_push() POSTs
--   {request_id, secret}
-- to this endpoint, so if push_trigger_secret is ever set while the endpoint
-- still points at a domain someone else could acquire, the trigger would send
-- our shared secret to a third party. Repointing it removes that latent risk.
--
-- NOTE: this does NOT switch push notifications on. As of this migration:
--   * app_settings.push_trigger_secret does not exist, and the trigger returns
--     early when it is NULL — so it has never fired,
--   * no route in the app serves /api/public/push/replacement-status, so the
--     endpoint below is currently a 404,
--   * public.push_subscriptions has 0 rows.
-- Enabling push therefore needs: the route implemented, push_trigger_secret
-- inserted, and clients subscribed. The URL is set to the intended final path
-- so that work only has to add the route, not chase config.

UPDATE public.app_settings
SET value = jsonb_set(
      value::jsonb,
      '{endpoint}',
      to_jsonb('https://maktabali.com/api/public/push/replacement-status'::text),
      true
    )
WHERE key = 'push_config';

-- Insert it if the row is missing entirely (fresh local databases).
INSERT INTO public.app_settings(key, value)
SELECT 'push_config', jsonb_build_object(
  'endpoint', 'https://maktabali.com/api/public/push/replacement-status'
)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'push_config');
