CREATE OR REPLACE FUNCTION public._contains_profanity(input text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    -- Multi-word phrases: allow raw substring match.
    IF position(' ' IN nw) > 0 THEN
      IF position(nw IN n) > 0 THEN RETURN true; END IF;
    ELSE
      -- Single tokens: whole-word match only, to avoid false positives
      -- on innocent words like "الكلاب", "اهلكم", "بهيمة" that would
      -- otherwise trigger auto-block via the guard trigger.
      IF position(' ' || nw || ' ' IN ' ' || n || ' ') > 0 THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN false;
END; $function$;