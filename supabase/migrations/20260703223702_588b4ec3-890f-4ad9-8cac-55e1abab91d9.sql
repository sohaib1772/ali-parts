
CREATE TABLE public.user_block_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('block','unblock')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.user_block_log TO authenticated;
GRANT ALL ON public.user_block_log TO service_role;

ALTER TABLE public.user_block_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "block log: admins read"
  ON public.user_block_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "block log: admins insert"
  ON public.user_block_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE INDEX idx_user_block_log_created_at ON public.user_block_log(created_at DESC);
CREATE INDEX idx_user_block_log_user ON public.user_block_log(user_id);
