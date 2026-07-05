
-- 1) Normalization helper
CREATE OR REPLACE FUNCTION public._normalize_ar(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE t text;
BEGIN
  IF input IS NULL THEN RETURN ''; END IF;
  t := lower(input);
  t := regexp_replace(t, '[\u064B-\u065F\u0670\u0640]', '', 'g');
  t := translate(t, 'إأآٱاىؤئةگچپڤ', 'اااااايويهكجبف');
  t := regexp_replace(t, '(.)\1{2,}', '\1\1', 'g');
  t := regexp_replace(t, '[^[:alnum:][:space:]\u0600-\u06FF]', ' ', 'g');
  t := regexp_replace(t, '\s+', ' ', 'g');
  RETURN btrim(t);
END; $$;

-- 2) Profanity list + check
CREATE OR REPLACE FUNCTION public._contains_profanity(input text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  n text := public._normalize_ar(input);
  words text[] := ARRAY[
    'كس','كسم','كسمك','كسختك','خرا','خره','خرى','خراء','طيز','طيزك','زب','زبي','زبك',
    'شرموط','شرموطه','قحبه','عرص','عرصات','منيوك','منيوج',
    'لعنة','لعن','يلعن','كلب','كلاب','حمار','حماره','حمير','بهيم','بهيمه',
    'خنزير','خنازير','نجس','وسخ','وسخه','تافه','حقير',
    'ابن الكلب','ابن كلب','ابن الحرام','ابن حرام','ابن الشرموطه','ابن العرص',
    'امك','اختك','خوك','دين امك','دين اختك','يخرب بيتك',
    'زاني','زانيه','عاهر','عاهره','سافل','سافله',
    'fuck','fuk','fck','shit','bitch','dick','cunt','asshole','bastard','whore','slut','motherfucker'
  ];
  w text;
  nw text;
BEGIN
  IF n = '' THEN RETURN false; END IF;
  FOREACH w IN ARRAY words LOOP
    nw := public._normalize_ar(w);
    IF nw = '' THEN CONTINUE; END IF;
    IF position(' ' || nw || ' ' IN ' ' || n || ' ') > 0 THEN RETURN true; END IF;
    IF position(nw IN n) > 0 AND length(nw) >= 4 THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END; $$;

-- 3) Trigger: reject profanity + auto-block author
CREATE OR REPLACE FUNCTION public.guard_banner_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked boolean := false;
BEGIN
  SELECT COALESCE(is_blocked, false) INTO v_blocked FROM public.profiles WHERE id = NEW.user_id;
  IF v_blocked THEN
    RAISE EXCEPTION 'حسابك محظور من التعليق بسبب مخالفة سابقة.';
  END IF;

  IF public._contains_profanity(NEW.content) THEN
    UPDATE public.profiles SET is_blocked = true WHERE id = NEW.user_id;
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
END; $$;

DROP TRIGGER IF EXISTS trg_guard_banner_comment_ins ON public.banner_comments;
CREATE TRIGGER trg_guard_banner_comment_ins
BEFORE INSERT ON public.banner_comments
FOR EACH ROW EXECUTE FUNCTION public.guard_banner_comment();

DROP TRIGGER IF EXISTS trg_guard_banner_comment_upd ON public.banner_comments;
CREATE TRIGGER trg_guard_banner_comment_upd
BEFORE UPDATE OF content ON public.banner_comments
FOR EACH ROW EXECUTE FUNCTION public.guard_banner_comment();

-- 4) Reinforce with RLS INSERT WITH CHECK against is_blocked
DROP POLICY IF EXISTS "Auth users insert own comments" ON public.banner_comments;
CREATE POLICY "Auth users insert own comments"
ON public.banner_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND ((is_admin_reply = false) OR public.has_role(auth.uid(), 'admin'))
  AND NOT COALESCE((SELECT is_blocked FROM public.profiles WHERE id = auth.uid()), false)
);
