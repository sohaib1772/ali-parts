
-- Make banner comments and commenter profile display publicly readable
GRANT SELECT ON public.banner_comments TO anon;

CREATE POLICY "Anon read comments"
ON public.banner_comments
FOR SELECT
TO anon
USING (true);

-- Allow public to see minimal commenter info (name/avatar) via profiles
CREATE POLICY "Profiles: public can view basic info"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);

GRANT SELECT ON public.profiles TO anon;
