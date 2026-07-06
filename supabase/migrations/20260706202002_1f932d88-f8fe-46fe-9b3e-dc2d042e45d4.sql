-- Staff accounts with granular permissions
CREATE TABLE public.staff_permissions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  can_orders boolean NOT NULL DEFAULT false,
  can_products boolean NOT NULL DEFAULT false,
  can_replacements boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_permissions TO authenticated;
GRANT ALL ON public.staff_permissions TO service_role;

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage staff" ON public.staff_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "staff read own permissions" ON public.staff_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER staff_permissions_updated_at
  BEFORE UPDATE ON public.staff_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpers
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid)
$$;

CREATE OR REPLACE FUNCTION public.staff_can(_uid uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _perm = 'orders' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_orders);
  ELSIF _perm = 'products' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_products);
  ELSIF _perm = 'replacements' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_replacements);
  END IF;
  RETURN false;
END;
$$;

-- Grant staff access to the resources their permissions allow
CREATE POLICY "staff view all orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.staff_can(auth.uid(), 'orders'));

CREATE POLICY "staff update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.staff_can(auth.uid(), 'orders'))
  WITH CHECK (public.staff_can(auth.uid(), 'orders'));

CREATE POLICY "staff delete orders" ON public.orders
  FOR DELETE TO authenticated
  USING (public.staff_can(auth.uid(), 'orders'));

CREATE POLICY "staff view all order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.staff_can(auth.uid(), 'orders'));

CREATE POLICY "staff manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.staff_can(auth.uid(), 'products'))
  WITH CHECK (public.staff_can(auth.uid(), 'products'));

CREATE POLICY "staff view stock movements" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.staff_can(auth.uid(), 'products'));

CREATE POLICY "staff view all replacements" ON public.replacement_requests
  FOR SELECT TO authenticated
  USING (public.staff_can(auth.uid(), 'replacements'));

CREATE POLICY "staff update replacements" ON public.replacement_requests
  FOR UPDATE TO authenticated
  USING (public.staff_can(auth.uid(), 'replacements'))
  WITH CHECK (public.staff_can(auth.uid(), 'replacements'));

CREATE POLICY "staff delete replacements" ON public.replacement_requests
  FOR DELETE TO authenticated
  USING (public.staff_can(auth.uid(), 'replacements'));

CREATE POLICY "staff view replacement log" ON public.replacement_status_log
  FOR SELECT TO authenticated
  USING (public.staff_can(auth.uid(), 'replacements'));

CREATE POLICY "staff delete banner comments" ON public.banner_comments
  FOR DELETE TO authenticated
  USING (public.staff_can(auth.uid(), 'replacements'));

-- Staff need to see customer profiles for orders/replacements screens
CREATE POLICY "staff view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));