-- Make loyalty points admin-configurable + fix the earning bug.
--
-- Redemption already exists and is money-safe (place_order recomputes the
-- discount server-side; the BEFORE INSERT trigger handle_order_points_redeem
-- deducts the balance atomically with FOR UPDATE). This migration only:
--   1. seeds 5 app_settings rows (defaults == today's hardcoded behavior),
--   2. makes place_order read the redeem rate + a NEW %-cap + min from settings
--      and lock the balance for the whole order,
--   3. fixes handle_order_status_change earning: per-1000 granularity (no more
--      round-to-0 under 10k) and a grant-once guard (no double-count on
--      re-delivery). Both earn changes are client-approved.
-- No customer's points_balance NUMBER is altered; protect_points_balance stays
-- intact (the edited functions still hold the app.allow_points_change flag).

-- ---------------------------------------------------------------------------
-- 1. Settings (unset key == exactly today's behavior via the COALESCE reads).
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value) VALUES
  ('points_redeem_iqd_per_point', '10'),
  ('points_earn_per_1000_iqd',    '10'),
  ('points_max_redeem_pct',       '50'),
  ('points_min_redeem',           '100'),
  ('points_card_text',            'كل 100 نقطة = 1,000 دينار خصم عند الشراء')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. place_order: configurable redeem rate + %-cap + min + FOR UPDATE balance.
--    Only the DECLARE block and the points-computation block change; everything
--    else is byte-identical to the live function.
-- ---------------------------------------------------------------------------
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
  v_rate numeric;         -- IQD per point (redeem)
  v_cap_pct numeric;      -- max % of order coverable by points
  v_min integer;          -- minimum points to redeem
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

  -- Loyalty redemption config (admin-editable; COALESCE → today's defaults).
  v_rate := GREATEST(1, COALESCE(
    (SELECT NULLIF(btrim(value),'')::numeric FROM public.app_settings WHERE key = 'points_redeem_iqd_per_point'), 10));
  v_cap_pct := LEAST(100, GREATEST(0, COALESCE(
    (SELECT NULLIF(btrim(value),'')::numeric FROM public.app_settings WHERE key = 'points_max_redeem_pct'), 50)));
  v_min := GREATEST(0, FLOOR(COALESCE(
    (SELECT NULLIF(btrim(value),'')::numeric FROM public.app_settings WHERE key = 'points_min_redeem'), 100)))::int;

  -- Lock the balance for the whole order so concurrent redemptions serialize.
  SELECT COALESCE(points_balance,0) INTO v_points_balance
    FROM public.profiles WHERE id = v_user FOR UPDATE;

  -- Enforce the minimum (the UI also enforces it; the server is the guarantee).
  IF COALESCE(p_points_used,0) > 0 AND p_points_used < v_min THEN
    RAISE EXCEPTION 'أقل عدد نقاط للاستبدال هو % نقطة', v_min;
  END IF;

  -- Server-computed max points: the balance, the subtotal's worth in points, and
  -- the %-cap of the whole order. Never trusts any client-sent discount.
  v_max_points := LEAST(
    COALESCE(v_points_balance,0),
    FLOOR(v_subtotal / v_rate)::int,
    FLOOR((v_subtotal + v_shipping) * v_cap_pct / 100.0 / v_rate)::int
  );
  v_points := GREATEST(0, LEAST(COALESCE(p_points_used,0), v_max_points));
  v_points_discount := v_points * v_rate;
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

-- ---------------------------------------------------------------------------
-- 3. handle_order_status_change: earning fix.
--    - per-1000 granularity from settings (no round-to-0 under 10,000 IQD)
--    - grant ONCE per order (OLD.points_earned = 0 guard) so re-delivering an
--      order can never re-grant points.
--    Cancel-refund block unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  earn integer;
BEGIN
  IF OLD.status IS DISTINCT FROM 'delivered' AND NEW.status = 'delivered'
     AND COALESCE(OLD.points_earned, 0) = 0 THEN
    earn := (FLOOR(COALESCE(NEW.subtotal_iqd, 0) / 1000)
             * GREATEST(0, COALESCE(
                 (SELECT NULLIF(btrim(value),'')::numeric
                    FROM public.app_settings WHERE key = 'points_earn_per_1000_iqd'), 10)))::int;
    IF earn > 0 THEN
      NEW.points_earned := earn;
      PERFORM set_config('app.allow_points_change', 'yes', true);
      UPDATE public.profiles SET points_balance = points_balance + earn WHERE id = NEW.user_id;
      PERFORM set_config('app.allow_points_change', '', true);
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' AND OLD.status <> 'delivered' THEN
    IF COALESCE(NEW.points_used, 0) > 0 THEN
      PERFORM set_config('app.allow_points_change', 'yes', true);
      UPDATE public.profiles SET points_balance = points_balance + NEW.points_used WHERE id = NEW.user_id;
      PERFORM set_config('app.allow_points_change', '', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
