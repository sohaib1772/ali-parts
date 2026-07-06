
-- Tighten avatar SELECT policies: only the owning user can read their raw objects.
-- Public display continues to work via short-lived signed URLs, which bypass RLS.
DROP POLICY IF EXISTS "Avatars read by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Avatars read by anon" ON storage.objects;

CREATE POLICY "Users read own avatar"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
