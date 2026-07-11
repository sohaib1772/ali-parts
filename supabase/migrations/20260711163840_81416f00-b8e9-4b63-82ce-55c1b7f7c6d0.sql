CREATE OR REPLACE FUNCTION public.notify_order_created()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, order_id, type, title, body, status)
  VALUES (NEW.user_id, NEW.id, 'order_status', 'تم استلام طلبك',
    'طلب رقم ' || COALESCE(NEW.order_number, substr(NEW.id::text, 1, 8)), NEW.status::text);
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.notify_order_status_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_title text; v_body text; v_label text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  v_label := CASE NEW.status::text
    WHEN 'received' THEN 'تم استلام طلبك'
    WHEN 'preparing' THEN 'جاري تجهيز طلبك'
    WHEN 'packed' THEN 'تم تغليف طلبك'
    WHEN 'shipped' THEN 'تم شحن طلبك للتوصيل'
    WHEN 'out_for_delivery' THEN 'طلبك خرج للتوصيل'
    WHEN 'delivered' THEN 'تم تسليم طلبك'
    WHEN 'cancelled' THEN 'تم إلغاء طلبك'
    ELSE 'تحديث على طلبك' END;
  v_title := v_label;
  v_body := 'طلب رقم ' || COALESCE(NEW.order_number, substr(NEW.id::text, 1, 8));
  INSERT INTO public.notifications (user_id, order_id, type, title, body, status)
  VALUES (NEW.user_id, NEW.id, 'order_status', v_title, v_body, NEW.status::text);
  RETURN NEW;
END; $function$;