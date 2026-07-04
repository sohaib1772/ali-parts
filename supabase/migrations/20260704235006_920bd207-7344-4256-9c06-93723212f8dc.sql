-- Notify all users when a new active banner (offer) is added
CREATE OR REPLACE FUNCTION public.notify_new_banner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    INSERT INTO public.notifications (user_id, type, title, body)
    SELECT p.id, 'promo',
      'عرض جديد 🎉',
      COALESCE(NEW.title_ar, 'شاهد أحدث العروض الحصرية الآن')
    FROM public.profiles p;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_banner ON public.banners;
CREATE TRIGGER trg_notify_new_banner
AFTER INSERT ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.notify_new_banner();