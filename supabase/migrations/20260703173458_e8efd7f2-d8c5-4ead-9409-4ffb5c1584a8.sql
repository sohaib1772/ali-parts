ALTER TABLE public.cart_items DROP CONSTRAINT cart_items_side_check;
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_side_check CHECK (side = ANY (ARRAY['LH'::text, 'RH'::text, 'PAIR'::text]));
ALTER TABLE public.order_items DROP CONSTRAINT order_items_side_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_side_check CHECK (side = ANY (ARRAY['LH'::text, 'RH'::text, 'PAIR'::text]));