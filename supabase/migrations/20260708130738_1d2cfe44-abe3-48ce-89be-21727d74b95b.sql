
DROP POLICY IF EXISTS "admins upload product images" ON storage.objects;
DROP POLICY IF EXISTS "admins update product images" ON storage.objects;
DROP POLICY IF EXISTS "admins delete product images" ON storage.objects;

CREATE POLICY "staff upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'admin') OR public.staff_can(auth.uid(),'products')));
CREATE POLICY "staff update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'admin') OR public.staff_can(auth.uid(),'products')));
CREATE POLICY "staff delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (public.has_role(auth.uid(),'admin') OR public.staff_can(auth.uid(),'products')));
