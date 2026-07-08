CREATE INDEX IF NOT EXISTS idx_products_created_at_desc ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_sales_count_created_at_desc ON public.products (sales_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_is_deal_created_at_desc ON public.products (is_deal, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_is_featured_created_at_desc ON public.products (is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id_created_at_desc ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, read_at) WHERE read_at IS NULL;