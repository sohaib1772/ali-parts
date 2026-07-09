DROP POLICY IF EXISTS "anon read public settings" ON public.app_settings;
CREATE POLICY "anon read public settings" ON public.app_settings
  FOR SELECT TO anon
  USING (key <> ALL (ARRAY['push_config'::text, 'push_trigger_secret'::text]));