-- ---------------------------------------------------------------------------
-- Migration: Fix Replacement Admin Notification Trigger & Enhance Order Cancellation
-- ---------------------------------------------------------------------------

-- 1. Fix notify_admin_new_replacement
-- The previous version attempted `ur.role IN ('admin', 'staff')` on `user_roles`,
-- which causes `invalid input value for enum app_role: "staff"` because app_role is ('admin', 'user').
-- Staff members are in `public.staff_permissions` with `can_replacements = true`.

CREATE OR REPLACE FUNCTION public.notify_admin_new_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title        text;
  v_body         text;
  v_product      text;
  v_reason_short text;
  v_admin_id     uuid;
BEGIN
  v_product := coalesce(NEW.product_name_ar, 'منتج غير محدد');
  v_reason_short := left(coalesce(NEW.reason, ''), 80);

  v_title := 'طلب استبدال جديد 🔄';
  v_body  := 'طلب استبدال للمنتج: ' || v_product;
  IF length(v_reason_short) > 0 THEN
    v_body := v_body || ' — السبب: ' || v_reason_short;
  END IF;

  -- Send to all admins and staff who can manage replacements
  FOR v_admin_id IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
    UNION
    SELECT user_id FROM public.staff_permissions WHERE can_replacements = true
  LOOP
    IF v_admin_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, body)
      VALUES (v_admin_id, 'admin_new_replacement', v_title, v_body);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_replacement ON public.replacement_requests;
CREATE TRIGGER trg_notify_admin_new_replacement
  AFTER INSERT ON public.replacement_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_replacement();

-- 2. Enhance cancel_my_order RPC
-- Allow admins and staff with orders permission to cancel any order.
-- Allow customers to cancel their own orders while received or preparing.
-- Return descriptive Arabic errors.

CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status    order_status;
  v_user_id   uuid;
  v_is_admin  boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول لإلغاء الطلب';
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin') OR public.staff_can(auth.uid(), 'orders');

  SELECT status, user_id INTO v_status, v_user_id
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  -- If not admin/staff, check ownership
  IF NOT v_is_admin AND v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'غير مصرح لك بإلغاء هذا الطلب';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'الطلب ملغي بالفعل';
  END IF;

  IF NOT v_is_admin AND v_status NOT IN ('received', 'preparing') THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الطلب بعد تجهيزه أو شحنه';
  END IF;

  UPDATE public.orders
     SET status = 'cancelled'
   WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_my_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(uuid) TO authenticated;
