ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS hidden_by_user boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS orders_user_hidden_idx ON public.orders(user_id, hidden_by_user);