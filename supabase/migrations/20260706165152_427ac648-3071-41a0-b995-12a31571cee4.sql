
DROP POLICY IF EXISTS "Profiles: public identity via view" ON public.profiles;
DROP VIEW IF EXISTS public.public_profiles;
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT (id, full_name, avatar_url) ON public.profiles FROM anon;
