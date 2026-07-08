
CREATE TABLE public.price_update_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_rate numeric(12,2) NOT NULL,
  new_rate numeric(12,2) NOT NULL,
  rounding integer NOT NULL DEFAULT 0,
  excluded_ids uuid[] NOT NULL DEFAULT '{}',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_update_backups TO authenticated;
GRANT ALL ON public.price_update_backups TO service_role;

ALTER TABLE public.price_update_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage price backups"
  ON public.price_update_backups
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
