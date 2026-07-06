
CREATE POLICY "no direct access" ON public.admin_otp_challenges FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no direct access" ON public.admin_otp_verifications FOR ALL TO authenticated USING (false) WITH CHECK (false);
