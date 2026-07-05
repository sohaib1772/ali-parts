DO $$
BEGIN
  WITH ranked AS (
    SELECT
      id,
      user_id,
      product_id,
      side,
      quantity,
      FIRST_VALUE(id) OVER (PARTITION BY user_id, product_id ORDER BY created_at, id::text) AS keep_id,
      FIRST_VALUE(side) OVER (
        PARTITION BY user_id, product_id
        ORDER BY CASE WHEN side IS NULL THEN 1 ELSE 0 END, created_at DESC, id::text DESC
      ) AS preferred_side,
      SUM(quantity) OVER (PARTITION BY user_id, product_id) AS total_quantity,
      ROW_NUMBER() OVER (PARTITION BY user_id, product_id ORDER BY created_at, id::text) AS rn
    FROM public.cart_items
  ), updated AS (
    UPDATE public.cart_items ci
    SET
      quantity = ranked.total_quantity,
      side = ranked.preferred_side
    FROM ranked
    WHERE ci.id = ranked.keep_id
      AND ranked.rn = 1
    RETURNING ci.id
  )
  DELETE FROM public.cart_items ci
  USING ranked
  WHERE ci.id = ranked.id
    AND ranked.rn > 1;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cart_items_user_product_side_unique'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items DROP CONSTRAINT cart_items_user_product_side_unique;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cart_items_user_product_side_key'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items DROP CONSTRAINT cart_items_user_product_side_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cart_items_user_product_unique'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_user_product_unique UNIQUE (user_id, product_id);
  END IF;
END $$;

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
  ON CONFLICT ON CONSTRAINT cart_items_user_product_unique
  DO UPDATE SET
    quantity = public.cart_items.quantity + EXCLUDED.quantity,
    side = COALESCE(EXCLUDED.side, public.cart_items.side);
END;
$$;

REVOKE ALL ON FUNCTION public.add_cart_item(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_cart_item(uuid, integer, text) TO authenticated;