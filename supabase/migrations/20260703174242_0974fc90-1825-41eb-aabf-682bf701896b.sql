-- 1. Table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'order_status',
  title text NOT NULL,
  body text,
  status text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications(user_id) WHERE read_at IS NULL;

-- 2. Grants
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- 3. RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Trigger: on order status change, insert a notification for the user
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_body text;
  v_label text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_label := CASE NEW.status::text
    WHEN 'received' THEN 'تم استلام طلبك'
    WHEN 'preparing' THEN 'جاري تجهيز طلبك'
    WHEN 'packed' THEN 'تم تغليف طلبك'
    WHEN 'shipped' THEN 'تم شحن طلبك للتوصيل'
    WHEN 'out_for_delivery' THEN 'طلبك خرج للتوصيل'
    WHEN 'delivered' THEN 'تم تسليم طلبك'
    WHEN 'cancelled' THEN 'تم إلغاء طلبك'
    ELSE 'تحديث على طلبك'
  END;

  v_title := v_label;
  v_body := 'طلب رقم ' || COALESCE(NEW.order_number, substr(NEW.id::text, 1, 8));

  INSERT INTO public.notifications (user_id, order_id, type, title, body, status)
  VALUES (NEW.user_id, NEW.id, 'order_status', v_title, v_body, NEW.status::text);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_status_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notify_order_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_status_change();

-- 5. Also notify on order creation (initial "received")
CREATE OR REPLACE FUNCTION public.notify_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, order_id, type, title, body, status)
  VALUES (
    NEW.user_id,
    NEW.id,
    'order_status',
    'تم استلام طلبك',
    'طلب رقم ' || COALESCE(NEW.order_number, substr(NEW.id::text, 1, 8)),
    NEW.status::text
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_created() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_notify_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_created();

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;