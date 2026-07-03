
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS side text CHECK (side IN ('LH','RH'));
ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS cart_items_user_id_product_id_key;
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_user_product_side_key UNIQUE (user_id, product_id, side);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS side text CHECK (side IN ('LH','RH'));
