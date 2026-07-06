
ALTER TABLE public.replacement_requests
  ADD COLUMN IF NOT EXISTS attachments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Storage policies on the replacement-attachments bucket
-- Files are stored as: <user_id>/<request_id>/<filename>

CREATE POLICY "users upload own replacement attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'replacement-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "users read own replacement attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'replacement-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "users delete own replacement attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'replacement-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "admins read all replacement attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'replacement-attachments'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "admins delete replacement attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'replacement-attachments'
  AND public.has_role(auth.uid(), 'admin')
);
