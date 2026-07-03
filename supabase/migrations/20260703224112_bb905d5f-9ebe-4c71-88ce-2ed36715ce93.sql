
CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(
  p_user_id uuid,
  p_blocked boolean,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_title text;
  v_body text;
BEGIN
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;

  UPDATE public.profiles SET is_blocked = COALESCE(p_blocked,false) WHERE id = p_user_id;

  INSERT INTO public.user_block_log(user_id, actor_id, action)
  VALUES (p_user_id, v_actor, CASE WHEN p_blocked THEN 'block' ELSE 'unblock' END);

  IF p_blocked THEN
    v_title := 'تم حظر حسابك';
    v_body := COALESCE(NULLIF(TRIM(p_reason),''),
      'تم حظر حسابك لأنك قمت بإرسال أكثر من طلب وهمي. يرجى التواصل مع قسم المبيعات.');
  ELSE
    v_title := 'تم رفع الحظر عن حسابك';
    v_body := COALESCE(NULLIF(TRIM(p_reason),''),
      'تم رفع الحظر عن حسابك، يمكنك الآن إرسال الطلبات كالمعتاد.');
  END IF;

  INSERT INTO public.notifications(user_id, type, title, body)
  VALUES (p_user_id, 'account_status', v_title, v_body);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_blocked(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean, text) TO authenticated;
