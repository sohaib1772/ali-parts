
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_block boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.staff_can(_uid uuid, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _perm = 'orders' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_orders);
  ELSIF _perm = 'products' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_products);
  ELSIF _perm = 'replacements' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_replacements);
  ELSIF _perm = 'block' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_block);
  END IF;
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_title text;
  v_body text;
BEGIN
  IF v_actor IS NULL OR (NOT public.has_role(v_actor, 'admin') AND NOT public.staff_can(v_actor, 'block')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'لا يمكنك حظر حسابك.';
  END IF;
  IF public.has_role(p_user_id, 'admin') THEN
    RAISE EXCEPTION 'لا يمكن حظر حساب مدير.';
  END IF;

  UPDATE public.profiles
  SET is_blocked = COALESCE(p_blocked, false)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, is_blocked)
    VALUES (p_user_id, COALESCE(p_blocked, false))
    ON CONFLICT (id) DO UPDATE SET is_blocked = EXCLUDED.is_blocked;
  END IF;

  INSERT INTO public.user_block_log(user_id, actor_id, action)
  VALUES (p_user_id, v_actor, CASE WHEN COALESCE(p_blocked, false) THEN 'block' ELSE 'unblock' END);

  IF COALESCE(p_blocked, false) THEN
    v_title := 'تم حظر حسابك من التعليقات';
    v_body := COALESCE(NULLIF(TRIM(p_reason), ''),
      'تم حظرك بسبب تعليق مخالف لقوانين المجتمع. يرجى الالتزام بالكلام المحترم وتجنب الإساءة أو السبام أو المحتوى غير اللائق.');
  ELSE
    v_title := 'تم رفع الحظر عن حسابك';
    v_body := COALESCE(NULLIF(TRIM(p_reason), ''),
      'تم رفع الحظر عن حسابك، يمكنك الآن التفاعل والتعليق بشكل طبيعي مع الالتزام بالقوانين.');
  END IF;

  INSERT INTO public.notifications(user_id, type, title, body)
  VALUES (p_user_id, 'account_status', v_title, v_body);
END;
$function$;
