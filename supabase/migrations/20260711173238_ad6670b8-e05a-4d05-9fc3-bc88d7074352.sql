
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean := false;
  v_can_block boolean := false;
  v_allow_blocked text := current_setting('app.allow_blocked_change', true);
BEGIN
  -- Service role / no auth context (triggers, definer functions) bypasses
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_role(v_actor, 'admin');
  v_can_block := public.staff_can(v_actor, 'block');

  -- is_blocked can only be changed by admins/staff-with-block, or via
  -- SECURITY DEFINER paths that opt in with app.allow_blocked_change = 'yes'.
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND NOT v_is_admin
     AND NOT v_can_block
     AND COALESCE(v_allow_blocked, '') IS DISTINCT FROM 'yes' THEN
    NEW.is_blocked := OLD.is_blocked;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_sensitive_fields_trg ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- Update admin_set_user_blocked to opt-in to the guard
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

  PERFORM set_config('app.allow_blocked_change', 'yes', true);
  UPDATE public.profiles
  SET is_blocked = COALESCE(p_blocked, false)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, is_blocked)
    VALUES (p_user_id, COALESCE(p_blocked, false))
    ON CONFLICT (id) DO UPDATE SET is_blocked = EXCLUDED.is_blocked;
  END IF;
  PERFORM set_config('app.allow_blocked_change', '', true);

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

-- Ensure guard_banner_comment (which sets is_blocked = true) still works: it runs SECURITY DEFINER with auth.uid() = the user themselves.
-- We must allow that path. Wrap its update in the opt-in.
CREATE OR REPLACE FUNCTION public.guard_banner_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_blocked boolean := false;
BEGIN
  SELECT COALESCE(is_blocked, false) INTO v_blocked FROM public.profiles WHERE id = NEW.user_id;
  IF v_blocked THEN
    RAISE EXCEPTION 'حسابك محظور من التعليق بسبب مخالفة سابقة.';
  END IF;

  IF public._contains_profanity(NEW.content) THEN
    PERFORM set_config('app.allow_blocked_change', 'yes', true);
    UPDATE public.profiles SET is_blocked = true WHERE id = NEW.user_id;
    PERFORM set_config('app.allow_blocked_change', '', true);
    INSERT INTO public.user_block_log(user_id, actor_id, action)
    VALUES (NEW.user_id, NEW.user_id, 'block');
    INSERT INTO public.notifications(user_id, type, title, body)
    VALUES (
      NEW.user_id,
      'account_status',
      'تم حظر حسابك من التعليقات',
      'تم حظر حسابك تلقائيًا بسبب استخدام كلمات مسيئة. يمنع نشر أي تعليق جديد. للاستفسار يرجى التواصل مع الإدارة.'
    );
    RAISE EXCEPTION 'تعليقك يحتوي كلمات مسيئة، تم حظر حسابك من التعليقات.';
  END IF;

  RETURN NEW;
END; $function$;
