CREATE POLICY "Users can cancel own pending orders" ON public.orders
FOR UPDATE
USING (auth.uid() = user_id AND status IN ('received','preparing'))
WITH CHECK (auth.uid() = user_id AND status = 'cancelled');