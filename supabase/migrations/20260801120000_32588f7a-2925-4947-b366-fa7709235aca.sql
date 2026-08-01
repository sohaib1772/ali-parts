-- Let admins manage car models (نوع السيارة) from the admin panel.
--
-- public.car_models had only a public-read policy ("Car models public read"),
-- so the new admin car-model manager could read the list but every insert/
-- update/delete was blocked by RLS. This adds the missing admin-write policy,
-- mirroring the existing "admins manage brands" policy exactly. Additive and
-- safe: the public-read policy and all existing rows are untouched.
CREATE POLICY "admins manage car models" ON public.car_models
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
