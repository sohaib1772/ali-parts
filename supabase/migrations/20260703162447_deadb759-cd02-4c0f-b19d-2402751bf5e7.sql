
-- 1) sales_count on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sales_count bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS products_sales_count_idx ON public.products(sales_count DESC);

UPDATE public.products p SET sales_count = COALESCE(sub.s, 0)
FROM (
  SELECT oi.product_id, SUM(oi.quantity)::bigint AS s
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
  WHERE oi.product_id IS NOT NULL
  GROUP BY oi.product_id
) sub
WHERE p.id = sub.product_id;

CREATE OR REPLACE FUNCTION public.increment_product_sales()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products SET sales_count = sales_count + NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_increment_product_sales ON public.order_items;
CREATE TRIGGER trg_increment_product_sales AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.increment_product_sales();

CREATE OR REPLACE FUNCTION public.adjust_sales_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
    UPDATE public.products p SET sales_count = GREATEST(0, sales_count - oi.quantity)
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
  ELSIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    UPDATE public.products p SET sales_count = sales_count + oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_adjust_sales_on_cancel ON public.orders;
CREATE TRIGGER trg_adjust_sales_on_cancel AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.adjust_sales_on_cancel();

-- 2) Drop the previously exposed SECURITY DEFINER aggregation function
DROP FUNCTION IF EXISTS public.best_selling_products();

-- 3) Server-side order placement (fixes price manipulation)
CREATE OR REPLACE FUNCTION public.place_order(
  p_address jsonb,
  p_payment text,
  p_points_used integer,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_payment IS NULL OR p_payment NOT IN ('cod','transfer') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF p_address IS NULL THEN RAISE EXCEPTION 'Address required'; END IF;

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
END; $$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text, integer, text) TO authenticated;

-- 4) Prevent direct client writes to orders/order_items so prices cannot be forged
DROP POLICY IF EXISTS "Orders: own insert" ON public.orders;
DROP POLICY IF EXISTS "Order items: own insert" ON public.order_items;
REVOKE INSERT ON public.orders FROM authenticated, anon;
REVOKE INSERT ON public.order_items FROM authenticated, anon;

-- 5) Lock down internal SECURITY DEFINER helpers from direct authenticated execution.
--    They remain usable by RLS policies and triggers because those evaluate as the
--    function owner, not the calling role.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_points_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_points_redeem() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_product_sales() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.adjust_sales_on_cancel() FROM PUBLIC, anon, authenticated;
