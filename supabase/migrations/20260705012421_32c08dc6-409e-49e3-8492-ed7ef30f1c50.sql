CREATE OR REPLACE FUNCTION public.add_cart_item(
  p_product_id uuid,
  p_quantity integer DEFAULT 1,
  p_side text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quantity integer := GREATEST(1, COALESCE(p_quantity, 1));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_side IS NOT NULL AND p_side NOT IN ('LH', 'RH', 'PAIR') THEN
    RAISE EXCEPTION 'Invalid side';
  END IF;

  INSERT INTO public.cart_items (user_id, product_id, quantity, side)
  VALUES (v_user, p_product_id, v_quantity, p_side)
  ON CONFLICT ON CONSTRAINT cart_items_user_product_side_unique
  DO UPDATE SET quantity = public.cart_items.quantity + EXCLUDED.quantity;
END;
$$;

REVOKE ALL ON FUNCTION public.add_cart_item(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_cart_item(uuid, integer, text) TO authenticated;