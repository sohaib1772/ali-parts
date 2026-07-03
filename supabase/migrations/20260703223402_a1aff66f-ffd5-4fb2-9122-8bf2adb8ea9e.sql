
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- Admin can update any profile (needed to toggle is_blocked)
DROP POLICY IF EXISTS "Profiles: admins can update all" ON public.profiles;
CREATE POLICY "Profiles: admins can update all"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Block ordering for blocked users at the RPC level
CREATE OR REPLACE FUNCTION public.place_order(p_address jsonb, p_payment text, p_points_used integer, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_order_id uuid;
  v_subtotal numeric(12,0) := 0;
  v_shipping numeric(12,0) := 0;
  v_total numeric(12,0) := 0;
  v_points_discount numeric(12,0);
  v_points_balance integer := 0;
  v_max_points integer;
  v_points integer;
  v_blocked boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_payment IS NULL OR p_payment NOT IN ('cod','transfer') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF p_address IS NULL THEN RAISE EXCEPTION 'Address required'; END IF;

  SELECT COALESCE(is_blocked,false) INTO v_blocked FROM public.profiles WHERE id = v_user;
  IF v_blocked THEN
    RAISE EXCEPTION 'حسابك محظور من إرسال الطلبات. للاستفسار يرجى التواصل مع الإدارة.';
  END IF;

  SELECT COALESCE(SUM(p.price_iqd * ci.quantity),0),
         COALESCE(MAX(p.shipping_iqd),0)
    INTO v_subtotal, v_shipping
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.user_id = v_user;

  IF v_subtotal = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT COALESCE(points_balance,0) INTO v_points_balance FROM public.profiles WHERE id = v_user;
  v_max_points := LEAST(COALESCE(v_points_balance,0), FLOOR(v_subtotal / 10)::int);
  v_points := GREATEST(0, LEAST(COALESCE(p_points_used,0), v_max_points));
  v_points_discount := v_points * 10;
  v_total := GREATEST(0, v_subtotal + v_shipping - v_points_discount);

  INSERT INTO public.orders(user_id, address, payment_method, subtotal_iqd, shipping_iqd, total_iqd, points_used, notes)
  VALUES (v_user, p_address, p_payment, v_subtotal, v_shipping, v_total, v_points,
          NULLIF(TRIM(COALESCE(p_notes,'')), ''))
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items(order_id, product_id, name_ar, oem_number, image_url, unit_price_iqd, quantity, side, note)
  SELECT v_order_id, p.id, p.name_ar, p.oem_number,
         CASE WHEN array_length(p.images,1) > 0 THEN p.images[1] ELSE NULL END,
         p.price_iqd, ci.quantity, ci.side, ci.note
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.user_id = v_user;

  DELETE FROM public.cart_items WHERE user_id = v_user;

  RETURN v_order_id;
END; $function$;
