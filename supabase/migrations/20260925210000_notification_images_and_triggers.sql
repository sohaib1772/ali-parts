-- ---------------------------------------------------------------------------
-- Migration: Notification Images, New Product Notifications, Replacement
--            Request Notifications
-- ---------------------------------------------------------------------------

-- 1. Add image_url and product_id columns to notifications table
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

-- Index for product-type notifications
CREATE INDEX IF NOT EXISTS idx_notifications_product_id ON public.notifications(product_id) WHERE product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Update admin_broadcast_notification to accept p_image_url
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title     text,
  p_body      text,
  p_audience  text DEFAULT 'all_users',
  p_user_id   uuid DEFAULT NULL,
  p_image_url text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title    text := btrim(coalesce(p_title, ''));
  v_body     text := btrim(coalesce(p_body, ''));
  v_image    text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_count    integer;
  v_expected integer;
  v_recent   integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF length(v_title) = 0 THEN
    RAISE EXCEPTION 'العنوان مطلوب';
  END IF;
  IF length(v_title) > 80 THEN
    RAISE EXCEPTION 'العنوان يتجاوز 80 حرفاً';
  END IF;
  IF length(v_body) > 300 THEN
    RAISE EXCEPTION 'النص يتجاوز 300 حرف';
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.admin_broadcast_recipients(p_audience, p_user_id);

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'لا يوجد مستلمون لهذه الشريحة';
  END IF;

  -- 10-second double-send cooldown
  SELECT count(*) INTO v_recent
  FROM public.notifications
  WHERE type = 'admin_broadcast'
    AND created_at > now() - interval '10 seconds';

  IF v_recent > 0 THEN
    RAISE EXCEPTION 'تم إرسال إشعار جماعي قبل لحظات. انتظر قليلاً ثم حاول مرة أخرى.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, image_url)
  SELECT r.user_id, 'admin_broadcast', v_title, nullif(v_body, ''), v_image
  FROM public.admin_broadcast_recipients(p_audience, p_user_id) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant execute to authenticated (covers existing + new signature)
REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Trigger: Notify all customers when a new product is added
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title text;
  v_body  text;
  v_image text;
  v_recent integer;
BEGIN
  -- 30-second cooldown to prevent bulk-import spam
  SELECT count(*) INTO v_recent
  FROM public.notifications
  WHERE type = 'new_product'
    AND created_at > now() - interval '30 seconds';

  IF v_recent > 0 THEN
    RETURN NEW;
  END IF;

  v_title := 'وصل حديثاً! 🔔';
  v_body  := '⁕ ' || coalesce(NEW.name_ar, 'منتج جديد') || ' — كن أول من يطلع على التفاصيل والأسعار في السوق.';

  -- First image from the images array (if exists)
  v_image := CASE
    WHEN NEW.images IS NOT NULL AND array_length(NEW.images, 1) > 0
    THEN NEW.images[1]
    ELSE NULL
  END;

  INSERT INTO public.notifications (user_id, type, title, body, image_url, product_id)
  SELECT p.id, 'new_product', v_title, v_body, v_image, NEW.id
  FROM public.profiles p
  WHERE NOT public.has_role(p.id, 'admin');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_product ON public.products;
CREATE TRIGGER trg_notify_new_product
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_product();

-- ---------------------------------------------------------------------------
-- 4. Trigger: Notify admins when a new replacement request is submitted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_admin_new_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title       text;
  v_body        text;
  v_product     text;
  v_reason_short text;
  v_admin       record;
BEGIN
  v_product := coalesce(NEW.product_name_ar, 'منتج غير محدد');
  v_reason_short := left(coalesce(NEW.reason, ''), 80);

  v_title := 'طلب استبدال جديد 🔄';
  v_body  := 'طلب استبدال للمنتج: ' || v_product;
  IF length(v_reason_short) > 0 THEN
    v_body := v_body || ' — السبب: ' || v_reason_short;
  END IF;

  -- Send to all admins and staff who can manage orders
  FOR v_admin IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'staff')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (v_admin.user_id, 'admin_new_replacement', v_title, v_body);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_replacement ON public.replacement_requests;
CREATE TRIGGER trg_notify_admin_new_replacement
  AFTER INSERT ON public.replacement_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_replacement();
