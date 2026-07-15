--------------------------------------------------------------------------------
-- Audit Step 2.1: null-safe price adjustment in place_order + seed critical setting
--   Identical to place_order from 20260715163918 (FOR UPDATE lock + no stock clamp),
--   changing ONLY the two price-adjust lines so a missing
--   global_price_adjustment_iqd row can no longer zero the order total
--   (GREATEST(0, NULL) = 0).
--------------------------------------------------------------------------------

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
  v_qty_total integer := 0;
  v_price_adjust numeric(12,0) := 0;
  r record;
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

  FOR r IN
    SELECT p.id, p.name_ar, p.stock_qty, ci.quantity
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.user_id = v_user
    ORDER BY p.id
    FOR UPDATE OF p
  LOOP
    IF r.stock_qty < r.quantity THEN
      RAISE EXCEPTION 'الكمية المطلوبة من "%" غير متوفرة. المتوفر: %', r.name_ar, r.stock_qty;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(p.price_iqd * ci.quantity),0),
         COALESCE(SUM(ci.quantity),0)
    INTO v_subtotal, v_qty_total
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.user_id = v_user;

  IF v_subtotal = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT COALESCE(SUM(group_fee), 0) INTO v_shipping
  FROM (
    SELECT MAX(COALESCE(p.shipping_iqd, 0)) AS group_fee
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    WHERE ci.user_id = v_user
    GROUP BY CASE
      WHEN COALESCE(p.merge_delivery, true) AND p.delivery_group IS NOT NULL AND btrim(p.delivery_group) <> ''
        THEN 'g:' || p.delivery_group
      ELSE 'p:' || p.id::text
    END
  ) g;

  SELECT COALESCE(MAX(NULLIF(trim(value), '')::numeric), 0)
    INTO v_price_adjust
    FROM public.app_settings
   WHERE key = 'global_price_adjustment_iqd';

  v_subtotal := GREATEST(0, v_subtotal + COALESCE(v_price_adjust,0) * v_qty_total);

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
         GREATEST(0, p.price_iqd + v_price_adjust), ci.quantity, ci.side, ci.note
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.user_id = v_user;

  UPDATE public.products p
     SET stock_qty = p.stock_qty - ci.quantity,
         in_stock  = CASE WHEN (p.stock_qty - ci.quantity) = 0 THEN false ELSE p.in_stock END
    FROM public.cart_items ci
   WHERE ci.user_id = v_user AND ci.product_id = p.id;

  DELETE FROM public.cart_items WHERE user_id = v_user;

  RETURN v_order_id;
END; $function$;

-- PART 2: guarantee the price-adjustment setting exists in EVERY environment,
--   so the (now null-safe) function always reads a concrete 0 rather than a missing row.
--   ON CONFLICT DO NOTHING => never overwrites an existing production value.
INSERT INTO public.app_settings (key, value)
VALUES ('global_price_adjustment_iqd', '0')
ON CONFLICT (key) DO NOTHING;
