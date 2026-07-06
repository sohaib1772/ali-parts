DROP POLICY IF EXISTS "admins delete orders" ON public.orders;
CREATE POLICY "admins delete orders" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));