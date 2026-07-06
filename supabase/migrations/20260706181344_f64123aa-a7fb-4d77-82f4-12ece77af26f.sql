ALTER TABLE public.orders DROP COLUMN IF EXISTS hidden_by_user;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Users can delete own orders" ON public.orders;
CREATE POLICY "Users can delete own orders" ON public.orders FOR DELETE TO authenticated USING (auth.uid() = user_id);