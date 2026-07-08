
-- Performance indexes. Additive only; no schema/data/permission changes.

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items(product_id);

CREATE INDEX IF NOT EXISTS orders_status_created_idx ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_at_desc_idx ON public.orders(created_at DESC);

CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS cart_items_user_id_idx ON public.cart_items(user_id);
CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON public.favorites(user_id);

CREATE INDEX IF NOT EXISTS banner_likes_banner_idx ON public.banner_likes(banner_id);
CREATE INDEX IF NOT EXISTS banner_likes_user_idx ON public.banner_likes(user_id);

CREATE INDEX IF NOT EXISTS replacement_requests_user_status_idx
  ON public.replacement_requests(user_id, status);

-- Case-insensitive prefix/substring search on OEM number for the search page.
CREATE INDEX IF NOT EXISTS products_oem_lower_idx
  ON public.products (lower(oem_number)) WHERE oem_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_name_ar_lower_idx
  ON public.products (lower(name_ar));

CREATE INDEX IF NOT EXISTS profiles_is_blocked_idx
  ON public.profiles(is_blocked) WHERE is_blocked = true;

ANALYZE public.products;
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.notifications;
ANALYZE public.banner_likes;
ANALYZE public.banner_comments;
ANALYZE public.favorites;
ANALYZE public.cart_items;
ANALYZE public.addresses;
ANALYZE public.replacement_requests;
