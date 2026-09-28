-- Migration: 20260928220000_delivery_groups_and_merging.sql
-- Adds merge_with_groups and max_merge_qty to products and updates place_order delivery calculation

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS merge_with_groups text[] DEFAULT '{}';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS max_merge_qty integer DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- Update place_order with delivery group & max_merge_qty bin-packing rules:
-- 1. No delivery group: Always independent (fee * quantity).
-- 2. Large items:
--    - Items merging with 'large' pack into large shipments respecting max_merge_qty.
--    - Non-mergeable large items add fee * quantity.
-- 3. Merging with Large:
--    - If large shipments exist, items merging with 'large' absorb at 0 extra fee
--      (up to their max_merge_qty limit per host parcel).
-- 4. Medium shipment:
--    - Remaining medium items merging with 'medium' pack into medium shipments.
--    - Small items merging with 'medium' absorb into medium shipments.
-- 5. Small shipment:
--    - Remaining small items merging with 'small' pack into small shipments.
-- 6. Unmerged items add fee * quantity.
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
  v_rate numeric;
  v_cap_pct numeric;
  v_min integer;
  r record;
  u record;

  -- Shipping calculation variables
  v_large_parcels_count integer[] := ARRAY[]::integer[];
  v_large_parcels_cap   integer[] := ARRAY[]::integer[];
  v_large_parcels_fee   numeric(12,0)[] := ARRAY[]::numeric[];
  v_large_indep_fee     numeric(12,0) := 0;
  v_large_indep_count   integer := 0;
  v_total_large_parcels integer := 0;
  v_large_shipping      numeric(12,0) := 0;

  v_med_parcels_count   integer[] := ARRAY[]::integer[];
  v_med_parcels_cap     integer[] := ARRAY[]::integer[];
  v_med_parcels_fee     numeric(12,0)[] := ARRAY[]::numeric[];
  v_med_indep_fee       numeric(12,0) := 0;
  v_med_indep_count     integer := 0;
  v_total_med_parcels   integer := 0;
  v_medium_shipping     numeric(12,0) := 0;

  v_sml_parcels_count   integer[] := ARRAY[]::integer[];
  v_sml_parcels_cap     integer[] := ARRAY[]::integer[];
  v_sml_parcels_fee     numeric(12,0)[] := ARRAY[]::numeric[];
  v_small_shipping      numeric(12,0) := 0;

  v_unmerged_shipping   numeric(12,0) := 0;
  v_placed              boolean;
  p_idx                 integer;
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

  -- ---------------------------------------------------------------------------
  -- 1. القطع الكبيرة: دمج القطع القابلة للدمج بحسب الحد الأقصى للطرد الواحد
  -- ---------------------------------------------------------------------------
  FOR u IN
    SELECT COALESCE(p.shipping_iqd, 0) AS fee,
           COALESCE(p.max_merge_qty,
             CASE WHEN p.specs IS NOT NULL AND p.specs ? 'max_merge_qty'
                  THEN NULLIF(p.specs->>'max_merge_qty', '')::integer
                  ELSE NULL END
           ) AS max_qty
    FROM public.cart_items ci
    JOIN public.products p ON p.id = ci.product_id
    CROSS JOIN generate_series(1, ci.quantity) AS g(idx)
    WHERE ci.user_id = v_user
      AND (
        LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%large%'
        OR LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%كبير%'
      )
      AND COALESCE(p.merge_delivery, true) = true
      AND (
        'large' = ANY(COALESCE(p.merge_with_groups, ARRAY[]::text[]))
        OR (p.specs IS NOT NULL AND (p.specs->'merge_with_groups')::text LIKE '%large%')
      )
    ORDER BY fee DESC
  LOOP
    v_placed := false;
    IF array_length(v_large_parcels_fee, 1) IS NOT NULL THEN
      FOR p_idx IN 1..array_length(v_large_parcels_fee, 1) LOOP
        IF v_large_parcels_count[p_idx] < v_large_parcels_cap[p_idx]
           AND v_large_parcels_count[p_idx] < COALESCE(u.max_qty, 999999) THEN
          v_large_parcels_count[p_idx] := v_large_parcels_count[p_idx] + 1;
          v_large_parcels_cap[p_idx]   := LEAST(v_large_parcels_cap[p_idx], COALESCE(u.max_qty, 999999));
          v_large_parcels_fee[p_idx]   := GREATEST(v_large_parcels_fee[p_idx], u.fee);
          v_placed := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_placed THEN
      v_large_parcels_count := array_append(v_large_parcels_count, 1);
      v_large_parcels_cap   := array_append(v_large_parcels_cap, COALESCE(u.max_qty, 999999));
      v_large_parcels_fee   := array_append(v_large_parcels_fee, u.fee);
    END IF;
  END LOOP;

  -- القطع الكبيرة المستقلة (غير القابلة للدمج مثل الأبواب والمحركات)
  SELECT COALESCE(SUM(COALESCE(p.shipping_iqd, 0) * ci.quantity), 0),
         COALESCE(SUM(ci.quantity), 0)
    INTO v_large_indep_fee, v_large_indep_count
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.user_id = v_user
    AND (
      LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%large%'
      OR LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%كبير%'
    )
    AND NOT (
      COALESCE(p.merge_delivery, true) = true
      AND (
        'large' = ANY(COALESCE(p.merge_with_groups, ARRAY[]::text[]))
        OR (p.specs IS NOT NULL AND (p.specs->'merge_with_groups')::text LIKE '%large%')
      )
    );

  v_total_large_parcels := COALESCE(array_length(v_large_parcels_fee, 1), 0) + v_large_indep_count;
  v_large_shipping := COALESCE((SELECT SUM(s) FROM unnest(v_large_parcels_fee) s), 0) + v_large_indep_fee;

  -- ---------------------------------------------------------------------------
  -- 2. تجهيز جدول مؤقت للقطع غير الكبيرة لمعالجة الامتصاص والدمج
  -- ---------------------------------------------------------------------------
  CREATE TEMPORARY TABLE IF NOT EXISTS _non_large (
    id uuid,
    fee numeric(12,0),
    qty integer,
    group_name text,
    can_merge boolean,
    merge_groups text[],
    max_qty integer
  ) ON COMMIT DROP;

  DELETE FROM _non_large;

  INSERT INTO _non_large(id, fee, qty, group_name, can_merge, merge_groups, max_qty)
  SELECT
    p.id,
    COALESCE(p.shipping_iqd, 0),
    ci.quantity,
    CASE
      WHEN LOWER(TRIM(COALESCE(p.delivery_group, ''))) = '' THEN NULL
      WHEN LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%medium%' OR LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%متوسط%' THEN 'medium'
      ELSE 'small'
    END,
    COALESCE(p.merge_delivery, true) AND LOWER(TRIM(COALESCE(p.delivery_group, ''))) <> '',
    CASE
      WHEN array_length(p.merge_with_groups, 1) > 0 THEN p.merge_with_groups
      WHEN p.specs IS NOT NULL AND p.specs ? 'merge_with_groups' THEN
        (SELECT COALESCE(array_agg(x.val), ARRAY[]::text[]) FROM jsonb_array_elements_text(p.specs->'merge_with_groups') AS x(val))
      WHEN COALESCE(p.merge_delivery, true) = true THEN
        CASE
          WHEN LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%medium%' OR LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%متوسط%' THEN ARRAY['medium', 'large']
          ELSE ARRAY['small', 'medium', 'large']
        END
      ELSE ARRAY[]::text[]
    END,
    COALESCE(p.max_merge_qty,
      CASE WHEN p.specs IS NOT NULL AND p.specs ? 'max_merge_qty'
           THEN NULLIF(p.specs->>'max_merge_qty', '')::integer
           ELSE NULL END
    )
  FROM public.cart_items ci
  JOIN public.products p ON p.id = ci.product_id
  WHERE ci.user_id = v_user
    AND NOT (
      LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%large%'
      OR LOWER(TRIM(COALESCE(p.delivery_group, ''))) LIKE '%كبير%'
    );

  -- امتصاص القطع في الشحنات الكبيرة (إذا وجدت شحنات كبيرة)
  IF v_total_large_parcels > 0 THEN
    UPDATE _non_large
       SET qty = GREATEST(0, qty - (CASE WHEN max_qty IS NOT NULL AND max_qty > 0 THEN v_total_large_parcels * max_qty ELSE 999999 END))
     WHERE can_merge AND ('large' = ANY(merge_groups));

    DELETE FROM _non_large WHERE qty <= 0;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. القطع المتوسطة
  -- ---------------------------------------------------------------------------
  FOR u IN
    SELECT nl.fee, nl.max_qty
    FROM _non_large nl
    CROSS JOIN generate_series(1, nl.qty) AS g(idx)
    WHERE nl.group_name = 'medium'
      AND nl.can_merge
      AND ('medium' = ANY(nl.merge_groups))
    ORDER BY nl.fee DESC
  LOOP
    v_placed := false;
    IF array_length(v_med_parcels_fee, 1) IS NOT NULL THEN
      FOR p_idx IN 1..array_length(v_med_parcels_fee, 1) LOOP
        IF v_med_parcels_count[p_idx] < v_med_parcels_cap[p_idx]
           AND v_med_parcels_count[p_idx] < COALESCE(u.max_qty, 999999) THEN
          v_med_parcels_count[p_idx] := v_med_parcels_count[p_idx] + 1;
          v_med_parcels_cap[p_idx]   := LEAST(v_med_parcels_cap[p_idx], COALESCE(u.max_qty, 999999));
          v_med_parcels_fee[p_idx]   := GREATEST(v_med_parcels_fee[p_idx], u.fee);
          v_placed := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_placed THEN
      v_med_parcels_count := array_append(v_med_parcels_count, 1);
      v_med_parcels_cap   := array_append(v_med_parcels_cap, COALESCE(u.max_qty, 999999));
      v_med_parcels_fee   := array_append(v_med_parcels_fee, u.fee);
    END IF;
  END LOOP;

  -- قطع متوسطة مستقلة
  SELECT COALESCE(SUM(fee * qty), 0), COALESCE(SUM(qty), 0)
    INTO v_med_indep_fee, v_med_indep_count
  FROM _non_large
  WHERE group_name = 'medium' AND NOT (can_merge AND ('medium' = ANY(merge_groups)));

  v_total_med_parcels := COALESCE(array_length(v_med_parcels_fee, 1), 0) + v_med_indep_count;
  v_medium_shipping := COALESCE((SELECT SUM(s) FROM unnest(v_med_parcels_fee) s), 0) + v_med_indep_fee;

  -- امتصاص القطع الصغيرة في الشحنات المتوسطة
  IF COALESCE(array_length(v_med_parcels_fee, 1), 0) > 0 THEN
    UPDATE _non_large
       SET qty = GREATEST(0, qty - (CASE WHEN max_qty IS NOT NULL AND max_qty > 0 THEN array_length(v_med_parcels_fee, 1) * max_qty ELSE 999999 END))
     WHERE group_name = 'small' AND can_merge AND ('medium' = ANY(merge_groups));

    DELETE FROM _non_large WHERE qty <= 0;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. القطع الصغيرة المتبقية
  -- ---------------------------------------------------------------------------
  FOR u IN
    SELECT nl.fee, nl.max_qty
    FROM _non_large nl
    CROSS JOIN generate_series(1, nl.qty) AS g(idx)
    WHERE nl.group_name = 'small'
      AND nl.can_merge
      AND ('small' = ANY(nl.merge_groups))
    ORDER BY nl.fee DESC
  LOOP
    v_placed := false;
    IF array_length(v_sml_parcels_fee, 1) IS NOT NULL THEN
      FOR p_idx IN 1..array_length(v_sml_parcels_fee, 1) LOOP
        IF v_sml_parcels_count[p_idx] < v_sml_parcels_cap[p_idx]
           AND v_sml_parcels_count[p_idx] < COALESCE(u.max_qty, 999999) THEN
          v_sml_parcels_count[p_idx] := v_sml_parcels_count[p_idx] + 1;
          v_sml_parcels_cap[p_idx]   := LEAST(v_sml_parcels_cap[p_idx], COALESCE(u.max_qty, 999999));
          v_sml_parcels_fee[p_idx]   := GREATEST(v_sml_parcels_fee[p_idx], u.fee);
          v_placed := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_placed THEN
      v_sml_parcels_count := array_append(v_sml_parcels_count, 1);
      v_sml_parcels_cap   := array_append(v_sml_parcels_cap, COALESCE(u.max_qty, 999999));
      v_sml_parcels_fee   := array_append(v_sml_parcels_fee, u.fee);
    END IF;
  END LOOP;

  v_small_shipping := COALESCE((SELECT SUM(s) FROM unnest(v_sml_parcels_fee) s), 0);

  -- ---------------------------------------------------------------------------
  -- 5. القطع غير المدمجة (المستقلة أو التي ليس لها مجموعة متطابقة)
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(SUM(fee * qty), 0)
    INTO v_unmerged_shipping
  FROM _non_large
  WHERE NOT (
    (group_name = 'medium' AND can_merge AND ('medium' = ANY(merge_groups)))
    OR
    (group_name = 'small' AND can_merge AND ('small' = ANY(merge_groups)))
  );

  v_shipping := v_large_shipping + v_medium_shipping + v_small_shipping + v_unmerged_shipping;

  -- تطبيق تعديل السعر العام إن وجد
  SELECT COALESCE(MAX(NULLIF(trim(value), '')::numeric), 0)
    INTO v_price_adjust
    FROM public.app_settings
   WHERE key = 'global_price_adjustment_iqd';

  v_subtotal := GREATEST(0, v_subtotal + COALESCE(v_price_adjust,0) * v_qty_total);

  v_rate := GREATEST(1, COALESCE(
    (SELECT NULLIF(btrim(value),'')::numeric FROM public.app_settings WHERE key = 'points_redeem_iqd_per_point'), 10));
  v_cap_pct := LEAST(100, GREATEST(0, COALESCE(
    (SELECT NULLIF(btrim(value),'')::numeric FROM public.app_settings WHERE key = 'points_max_redeem_pct'), 50)));
  v_min := GREATEST(0, FLOOR(COALESCE(
    (SELECT NULLIF(btrim(value),'')::numeric FROM public.app_settings WHERE key = 'points_min_redeem'), 100)))::int;

  SELECT COALESCE(points_balance,0) INTO v_points_balance
    FROM public.profiles WHERE id = v_user FOR UPDATE;

  IF COALESCE(p_points_used,0) > 0 AND p_points_used < v_min THEN
    RAISE EXCEPTION 'أقل عدد نقاط للاستبدال هو % نقطة', v_min;
  END IF;

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
