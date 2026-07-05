DO $$
BEGIN
  -- Merge any duplicate cart rows before tightening the rule.
  WITH ranked AS (
    SELECT
      id,
      user_id,
      product_id,
      side,
      quantity,
      FIRST_VALUE(id) OVER (PARTITION BY user_id, product_id, side ORDER BY created_at, id::text) AS keep_id,
      SUM(quantity) OVER (PARTITION BY user_id, product_id, side) AS total_quantity,
      ROW_NUMBER() OVER (PARTITION BY user_id, product_id, side ORDER BY created_at, id::text) AS rn
    FROM public.cart_items
  ), updated AS (
    UPDATE public.cart_items ci
    SET quantity = ranked.total_quantity
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
    WHERE conname = 'cart_items_user_product_side_key'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items DROP CONSTRAINT cart_items_user_product_side_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cart_items_user_product_side_unique'
      AND conrelid = 'public.cart_items'::regclass
  ) THEN
    ALTER TABLE public.cart_items
      ADD CONSTRAINT cart_items_user_product_side_unique
      UNIQUE NULLS NOT DISTINCT (user_id, product_id, side);
  END IF;
END $$;