-- Migration: notify_admins_on_new_order
-- Ensures that whenever a new order is inserted (via place_order RPC or direct INSERT),
-- notifications are inserted into public.notifications for both:
-- 1) The customer (type = 'order_status')
-- 2) All admins & order staff (type = 'admin_new_order')
--
-- Inserting into public.notifications automatically fires trg_dispatch_notification_push
-- which pushes an FCM notification asynchronously to all registered devices of the admins.

CREATE OR REPLACE FUNCTION public.notify_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_city text;
  v_total_formatted text;
  v_admin_body text;
  v_order_num text;
BEGIN
  v_order_num := COALESCE(NEW.order_number, substr(NEW.id::text, 1, 8));

  -- 1. Notify the customer (if user_id is present)
  IF NEW.user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = NEW.user_id
        AND n.order_id = NEW.id
        AND n.type = 'order_status'
    ) THEN
      INSERT INTO public.notifications (user_id, order_id, type, title, body, status)
      VALUES (
        NEW.user_id,
        NEW.id,
        'order_status',
        'تم استلام طلبك',
        'طلب رقم ' || v_order_num,
        NEW.status::text
      );
    END IF;
  END IF;

  -- 2. Determine customer name for admin notification
  v_customer_name := NULLIF(TRIM(NEW.address->>'full_name'), '');
  IF v_customer_name IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT full_name INTO v_customer_name
    FROM public.profiles
    WHERE id = NEW.user_id;
  END IF;
  v_customer_name := COALESCE(v_customer_name, 'زبون');

  -- 3. Determine city and total formatted
  v_city := NULLIF(TRIM(NEW.address->>'city'), '');
  v_total_formatted := TO_CHAR(COALESCE(NEW.total_iqd, 0), 'FM999,999,999') || ' د.ع';

  IF v_city IS NOT NULL THEN
    v_admin_body := 'الزبون: ' || v_customer_name || ' (' || v_city || ') - المبلغ: ' || v_total_formatted;
  ELSE
    v_admin_body := 'الزبون: ' || v_customer_name || ' - المبلغ: ' || v_total_formatted;
  END IF;

  -- 4. Notify all admins and staff members who have can_orders = true
  INSERT INTO public.notifications (user_id, order_id, type, title, body, status)
  SELECT DISTINCT
    u.user_id,
    NEW.id,
    'admin_new_order',
    'طلب جديد رقم #' || v_order_num,
    v_admin_body,
    NEW.status::text
  FROM (
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
    UNION
    SELECT user_id FROM public.staff_permissions WHERE can_orders = true
  ) u
  WHERE u.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = u.user_id
        AND n.order_id = NEW.id
        AND n.type = 'admin_new_order'
    );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Safeguard: Never let a notification dispatch error roll back order placement
  RAISE WARNING 'notify_order_created error: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_order_created() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_order_created() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_notify_order_created ON public.orders;
CREATE TRIGGER trg_notify_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_created();
