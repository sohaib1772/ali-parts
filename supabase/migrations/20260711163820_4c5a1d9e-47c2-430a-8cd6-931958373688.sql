CREATE OR REPLACE FUNCTION public.place_guest_order(p_items jsonb, p_address jsonb, p_payment text, p_notes text)
 RETURNS TABLE(order_id uuid, order_number text, guest_token uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_guest_token uuid := gen_random_uuid();
  v_subtotal numeric(12,0) := 0;
  v_shipping numeric(12,0) := 0;
  v_total numeric(12,0) := 0;
  v_qty_total integer := 0;
  v_price_adjust numeric(12,0) := 0;
  v_item jsonb;
  v_pid uuid;
  v_qty integer;
  v_side text;
  v_note text;
  r record;
  v_min_name text;
  v_min_phone text;
  v_min_city text;
  v_min_area text;
BEGIN
  IF p_payment IS NULL OR p_payment NOT IN ('cod','transfer') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF p_address IS NULL THEN RAISE EXCEPTION 'Address required'; END IF;

  v_min_name := btrim(coalesce(p_address->>'full_name',''));
  v_min_phone := btrim(coalesce(p_address->>'phone',''));
  v_min_city := btrim(coalesce(p_address->>'city',''));
  v_min_area := btrim(coalesce(p_address->>'area',''));
  IF v_min_name = '' OR char_length(v_min_name) < 2 THEN RAISE EXCEPTION 'الاسم الكامل مطلوب'; END IF;
  IF v_min_phone = '' OR char_length(regexp_replace(v_min_phone,'\D','','g')) < 10 THEN RAISE EXCEPTION 'رقم الهاتف مطلوب'; END IF;
  IF v_min_city = '' THEN RAISE EXCEPTION 'المحافظة مطلوبة'; END IF;
  IF v_min_area = '' THEN RAISE EXCEPTION 'المنطقة مطلوبة'; END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _guest_cart (
    product_id uuid, quantity integer, side text, note text
  ) ON COMMIT DROP;
  DELETE FROM _guest_cart WHERE true;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pid := NULLIF(v_item->>'product_id','')::uuid;
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    v_side := NULLIF(v_item->>'side','');
    v_note := NULLIF(v_item->>'note','');
    IF v_pid IS NULL THEN CONTINUE; END IF;
    IF v_side IS NOT NULL AND v_side NOT IN ('LH','RH','PAIR') THEN v_side := NULL; END IF;
    INSERT INTO _guest_cart(product_id, quantity, side, note) VALUES (v_pid, v_qty, v_side, v_note);
  END LOOP;

  FOR r IN
    SELECT p.id, p.name_ar, p.stock_qty, SUM(gc.quantity) AS qty
    FROM _guest_cart gc
    JOIN public.products p ON p.id = gc.product_id
    GROUP BY p.id, p.name_ar, p.stock_qty
  LOOP
    IF r.stock_qty < r.qty THEN
      RAISE EXCEPTION 'الكمية المطلوبة من "%" غير متوفرة. المتوفر: %', r.name_ar, r.stock_qty;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(p.price_iqd * gc.quantity),0), COALESCE(SUM(gc.quantity),0)
  INTO v_subtotal, v_qty_total
  FROM _guest_cart gc JOIN public.products p ON p.id = gc.product_id;

  IF v_subtotal = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT COALESCE(SUM(group_fee), 0) INTO v_shipping FROM (
    SELECT MAX(COALESCE(p.shipping_iqd, 0)) AS group_fee
    FROM _guest_cart gc JOIN public.products p ON p.id = gc.product_id
    GROUP BY CASE
      WHEN COALESCE(p.merge_delivery, true) AND p.delivery_group IS NOT NULL AND btrim(p.delivery_group) <> ''
        THEN 'g:' || p.delivery_group
      ELSE 'p:' || p.id::text
    END
  ) g;

  SELECT COALESCE(NULLIF(trim(value), '')::numeric, 0) INTO v_price_adjust
    FROM public.app_settings WHERE key = 'global_price_adjustment_iqd';
  v_subtotal := GREATEST(0, v_subtotal + v_price_adjust * v_qty_total);
  v_total := v_subtotal + v_shipping;

  INSERT INTO public.orders(user_id, is_guest, guest_token, address, payment_method, subtotal_iqd, shipping_iqd, total_iqd, notes)
  VALUES (NULL, true, v_guest_token, p_address, p_payment, v_subtotal, v_shipping, v_total,
          NULLIF(TRIM(COALESCE(p_notes,'')), ''))
  RETURNING orders.id, orders.order_number INTO v_order_id, v_order_number;

  INSERT INTO public.order_items(order_id, product_id, name_ar, oem_number, image_url, unit_price_iqd, quantity, side, note)
  SELECT v_order_id, p.id, p.name_ar, p.oem_number,
         CASE WHEN array_length(p.images,1) > 0 THEN p.images[1] ELSE NULL END,
         GREATEST(0, p.price_iqd + v_price_adjust), gc.quantity, gc.side, gc.note
  FROM _guest_cart gc JOIN public.products p ON p.id = gc.product_id;

  UPDATE public.products p
     SET stock_qty = GREATEST(0, p.stock_qty - gc.quantity),
         in_stock = CASE WHEN GREATEST(0, p.stock_qty - gc.quantity) = 0 THEN false ELSE p.in_stock END
    FROM _guest_cart gc WHERE gc.product_id = p.id;

  DELETE FROM _guest_cart WHERE true;

  order_id := v_order_id;
  order_number := v_order_number;
  guest_token := v_guest_token;
  RETURN NEXT;
END;
$function$;