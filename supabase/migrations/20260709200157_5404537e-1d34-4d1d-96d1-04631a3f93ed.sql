
-- Restrict app_settings anonymous reads: exclude push_config (contains internal push endpoint).
DROP POLICY IF EXISTS "public read settings" ON public.app_settings;

CREATE POLICY "anon read public settings"
ON public.app_settings
FOR SELECT
TO anon
USING (key <> 'push_config');

CREATE POLICY "authenticated read settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

-- Scope audit log read policy to authenticated role for defense in depth.
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
