
REVOKE EXECUTE ON FUNCTION public._normalize_ar(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._contains_profanity(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_banner_comment() FROM PUBLIC, anon, authenticated;
