
CREATE POLICY "block log: staff with block perm read"
  ON public.user_block_log FOR SELECT TO authenticated
  USING (public.staff_can(auth.uid(), 'block'));

CREATE POLICY "notifications: staff with block perm read account_status"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.staff_can(auth.uid(), 'block') AND type = 'account_status');
