
-- Safe minimal public identity view: id, full_name, avatar_url only.
-- SECURITY DEFINER-style access via GRANT on view; base table stays locked by RLS.
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT id, full_name, avatar_url
FROM public.profiles;

-- Views default to invoker in newer Supabase. Force definer semantics so
-- anon/authenticated can read the safe columns without a broad profiles policy.
ALTER VIEW public.public_profiles SET (security_invoker = false);

REVOKE ALL ON public.public_profiles FROM PUBLIC;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
