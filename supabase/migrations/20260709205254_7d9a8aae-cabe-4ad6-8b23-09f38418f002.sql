DROP POLICY IF EXISTS "authenticated read settings" ON public.app_settings;

CREATE POLICY "authenticated read non-sensitive settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (key NOT IN ('push_config', 'push_trigger_secret'));