
CREATE TABLE public.admin_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_otp_challenges_user_idx ON public.admin_otp_challenges(user_id, created_at DESC);
GRANT ALL ON public.admin_otp_challenges TO service_role;
ALTER TABLE public.admin_otp_challenges ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_otp_verifications (
  user_id uuid PRIMARY KEY,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
GRANT ALL ON public.admin_otp_verifications TO service_role;
ALTER TABLE public.admin_otp_verifications ENABLE ROW LEVEL SECURITY;
