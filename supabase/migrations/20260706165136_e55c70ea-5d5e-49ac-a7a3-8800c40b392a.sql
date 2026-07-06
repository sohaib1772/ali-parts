
-- Remove the over-permissive public policy on profiles
DROP POLICY IF EXISTS "Profiles: public can view basic info" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;

-- Create a safe, minimal public view for commenter identity display
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT id, full_name, avatar_url
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- The view is security_invoker, so it obeys the querying role's RLS on profiles.
-- Add a narrow SELECT policy so only the id/name/avatar columns exposed by the view
-- are readable publicly (RLS still applies at the table level regardless of columns).
CREATE POLICY "Profiles: public identity via view"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);

-- Restrict direct table SELECT by anon by revoking column privileges except the safe ones.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO anon;
