ALTER TABLE public.admin_otp_verifications ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE public.admin_otp_verifications DROP CONSTRAINT IF EXISTS admin_otp_verifications_pkey;
ALTER TABLE public.admin_otp_verifications ADD CONSTRAINT admin_otp_verifications_pkey PRIMARY KEY (user_id, device_id);