CREATE TABLE IF NOT EXISTS public.admin_otp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event text NOT NULL,
  device_id text,
  ip text,
  user_agent text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_otp_events TO authenticated;
GRANT ALL ON public.admin_otp_events TO service_role;

ALTER TABLE public.admin_otp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read otp events"
ON public.admin_otp_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS admin_otp_events_created_at_idx ON public.admin_otp_events (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_otp_events_event_idx ON public.admin_otp_events (event);