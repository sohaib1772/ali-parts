
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles: users can view own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles: users can update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles: users can insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Brands (car brands: Chevrolet, GMC, Cadillac)
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  logo_url TEXT,
  sort_order INT DEFAULT 0
);
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brands public read" ON public.brands FOR SELECT TO anon, authenticated USING (true);

-- Car models
CREATE TABLE public.car_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  image_url TEXT,
  sort_order INT DEFAULT 0
);
GRANT SELECT ON public.car_models TO anon, authenticated;
GRANT ALL ON public.car_models TO service_role;
ALTER TABLE public.car_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Car models public read" ON public.car_models FOR SELECT TO anon, authenticated USING (true);

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories public read" ON public.categories FOR SELECT TO anon, authenticated USING (true);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT,
  description_ar TEXT,
  oem_number TEXT,
  price_iqd NUMERIC(12,0) NOT NULL DEFAULT 0,
  price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  compare_price_iqd NUMERIC(12,0),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  compatible_models TEXT[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  in_stock BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_deal BOOLEAN NOT NULL DEFAULT false,
  specs JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products public read" ON public.products FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX ON public.products (category_id);
CREATE INDEX ON public.products (brand_id);
CREATE INDEX ON public.products (is_featured);
CREATE INDEX ON public.products (is_deal);

-- Banners
CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar TEXT,
  subtitle_ar TEXT,
  image_url TEXT NOT NULL,
  link TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true
);
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT ALL ON public.banners TO service_role;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banners public read" ON public.banners FOR SELECT TO anon, authenticated USING (is_active = true);

-- Cart
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cart: own" ON public.cart_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Favorites
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Favorites: own" ON public.favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Addresses
CREATE TABLE public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  label TEXT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  area TEXT,
  street TEXT,
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Addresses: own" ON public.addresses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Orders
CREATE TYPE order_status AS ENUM ('received','preparing','packed','shipped','out_for_delivery','delivered','cancelled');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT ('AP' || to_char(now(),'YYMMDD') || substr(replace(gen_random_uuid()::text,'-',''),1,6)),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'received',
  address JSONB NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cod',
  subtotal_iqd NUMERIC(12,0) NOT NULL DEFAULT 0,
  shipping_iqd NUMERIC(12,0) NOT NULL DEFAULT 0,
  total_iqd NUMERIC(12,0) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Orders: own read" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Orders: own insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL,
  oem_number TEXT,
  image_url TEXT,
  unit_price_iqd NUMERIC(12,0) NOT NULL,
  quantity INT NOT NULL
);
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order items: own read" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "Order items: own insert" ON public.order_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- Seed brands + car models + categories
INSERT INTO public.brands (name_ar, name_en, sort_order) VALUES
  ('شفروليه','Chevrolet',1),
  ('جي إم سي','GMC',2),
  ('كاديلاك','Cadillac',3);

INSERT INTO public.car_models (brand_id, name_ar, name_en, sort_order)
SELECT b.id, m.ar, m.en, m.o FROM public.brands b
JOIN (VALUES
  ('Chevrolet','ماليبو','Malibu',1),
  ('Chevrolet','ترافرس','Traverse',2),
  ('Chevrolet','إكوينوكس','Equinox',3),
  ('Chevrolet','تريل بليزر','Trailblazer',4),
  ('Chevrolet','تراكس','Trax',5),
  ('Chevrolet','بليزر','Blazer',6),
  ('Chevrolet','كروز','Cruze',7),
  ('Chevrolet','كابتيفا','Captiva',8),
  ('Chevrolet','تاهو','Tahoe',9),
  ('Chevrolet','سلفرادو','Silverado',10),
  ('GMC','يوكن','Yukon',1),
  ('GMC','تيرين','Terrain',2),
  ('GMC','أكاديا','Acadia',3),
  ('Cadillac','إسكاليد','Escalade',1)
) AS m(brand,ar,en,o) ON b.name_en = m.brand;

INSERT INTO public.categories (name_ar, name_en, icon, sort_order) VALUES
  ('محرك','Engine','engine',1),
  ('فرامل','Brakes','disc',2),
  ('تعليق','Suspension','suspension',3),
  ('كهرباء','Electrical','zap',4),
  ('فلاتر','Filters','filter',5),
  ('زيوت','Oils','droplet',6),
  ('هيكل','Body','car',7),
  ('إطارات','Tires','circle',8);

-- Sample products (small seed so the app is not empty)
INSERT INTO public.products (name_ar, description_ar, oem_number, price_iqd, price_usd, category_id, brand_id, compatible_models, is_featured, is_deal, in_stock)
SELECT
  'فلتر زيت أصلي', 'فلتر زيت شفروليه أصلي مضمون الجودة يناسب موديلات متعددة.',
  '12674860', 15000, 12, (SELECT id FROM public.categories WHERE name_en='Filters'),
  (SELECT id FROM public.brands WHERE name_en='Chevrolet'),
  ARRAY['Malibu','Cruze','Equinox'], true, true, true
UNION ALL SELECT 'وسادات فرامل أمامية', 'وسادات فرامل عالية الأداء ومقاومة للحرارة.',
  '84176642', 85000, 65, (SELECT id FROM public.categories WHERE name_en='Brakes'),
  (SELECT id FROM public.brands WHERE name_en='Chevrolet'),
  ARRAY['Tahoe','Silverado','Traverse'], true, false, true
UNION ALL SELECT 'بوجيهات إشعال إيريديوم', 'مجموعة 4 بوجيهات إيريديوم للأداء الأمثل.',
  '12680073', 65000, 50, (SELECT id FROM public.categories WHERE name_en='Engine'),
  (SELECT id FROM public.brands WHERE name_en='GMC'),
  ARRAY['Yukon','Acadia','Terrain'], true, true, true
UNION ALL SELECT 'مساعدات أمامية', 'مساعدات أصلية لتحسين ثبات السيارة.',
  '84557863', 220000, 170, (SELECT id FROM public.categories WHERE name_en='Suspension'),
  (SELECT id FROM public.brands WHERE name_en='Cadillac'),
  ARRAY['Escalade'], false, false, true
UNION ALL SELECT 'بطارية 80 أمبير', 'بطارية عالية الأداء بضمان سنة كاملة.',
  'BAT80AH', 175000, 135, (SELECT id FROM public.categories WHERE name_en='Electrical'),
  (SELECT id FROM public.brands WHERE name_en='Chevrolet'),
  ARRAY['Malibu','Cruze','Trax','Captiva'], true, false, true
UNION ALL SELECT 'زيت محرك موبيل 1 - 5W30', 'زيت اصطناعي بالكامل 5 لتر.',
  'MOB1-5W30', 95000, 72, (SELECT id FROM public.categories WHERE name_en='Oils'),
  (SELECT id FROM public.brands WHERE name_en='Chevrolet'),
  ARRAY['Malibu','Traverse','Equinox','Blazer'], false, true, true
UNION ALL SELECT 'مصباح LED أمامي', 'مصباح LED عالي السطوع بديل مباشر.',
  '84421659', 45000, 34, (SELECT id FROM public.categories WHERE name_en='Electrical'),
  (SELECT id FROM public.brands WHERE name_en='GMC'),
  ARRAY['Yukon','Terrain','Acadia'], false, false, true
UNION ALL SELECT 'فلتر هواء المكيف', 'فلتر كابينة مع فحم منشط.',
  '13503677', 22000, 17, (SELECT id FROM public.categories WHERE name_en='Filters'),
  (SELECT id FROM public.brands WHERE name_en='Chevrolet'),
  ARRAY['Trailblazer','Trax','Equinox'], false, true, true;

INSERT INTO public.banners (title_ar, subtitle_ar, image_url, sort_order) VALUES
  ('عروض قطع غيار حصرية','خصومات تصل إلى 30% على قطع محددة','',1),
  ('قطع أصلية 100%','ضمان الجودة والأصالة','',2);
