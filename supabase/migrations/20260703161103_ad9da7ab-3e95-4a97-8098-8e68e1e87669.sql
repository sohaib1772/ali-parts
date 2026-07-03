
CREATE OR REPLACE FUNCTION public.best_selling_products()
RETURNS TABLE (
  id uuid,
  name_ar text,
  name_en text,
  description_ar text,
  oem_number text,
  price_iqd numeric,
  price_usd numeric,
  compare_price_iqd numeric,
  shipping_iqd numeric,
  category_id uuid,
  brand_id uuid,
  compatible_models text[],
  images text[],
  in_stock boolean,
  is_featured boolean,
  is_deal boolean,
  specs jsonb,
  deal_expires_at timestamptz,
  sales_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name_ar, p.name_en, p.description_ar, p.oem_number,
         p.price_iqd, p.price_usd, p.compare_price_iqd, p.shipping_iqd,
         p.category_id, p.brand_id, p.compatible_models, p.images,
         p.in_stock, p.is_featured, p.is_deal, p.specs, p.deal_expires_at,
         COALESCE(SUM(oi.quantity), 0)::bigint AS sales_count
  FROM public.products p
  LEFT JOIN public.order_items oi ON oi.product_id = p.id
  LEFT JOIN public.orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
  GROUP BY p.id
  ORDER BY sales_count DESC, p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.best_selling_products() TO anon, authenticated;
