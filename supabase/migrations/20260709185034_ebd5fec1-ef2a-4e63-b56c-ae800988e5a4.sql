-- Speed up product list sorts and filters
CREATE INDEX IF NOT EXISTS idx_products_created_at_desc ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_sales_count_desc ON public.products (sales_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products (is_featured, created_at DESC) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_is_deal ON public.products (is_deal, created_at DESC) WHERE is_deal = true;
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products (category_id, in_stock DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products (brand_id, in_stock DESC, created_at DESC);

-- Speed up user-scoped orders
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders (user_id, created_at DESC);

-- Speed up unread notifications count and lists
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_all ON public.notifications (user_id, created_at DESC);

-- Cart, favorites, addresses
CREATE INDEX IF NOT EXISTS idx_cart_items_user ON public.cart_items (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON public.addresses (user_id);

-- Order items lookup by order
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);