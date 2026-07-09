
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS admin_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
