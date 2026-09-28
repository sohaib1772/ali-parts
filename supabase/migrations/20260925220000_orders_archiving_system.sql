-- ---------------------------------------------------------------------------
-- Migration: Orders Archiving System
-- ---------------------------------------------------------------------------

-- 1. Add is_archived and archived_at columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index for filtering archived vs active orders quickly
CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON public.orders(is_archived, created_at DESC);

-- Update RLS policies to allow admins to update archive status
-- (Admins already have full access via existing admin policies, but ensure authenticated users see only their own)
COMMENT ON COLUMN public.orders.is_archived IS 'Flag indicating whether the order is archived in the admin view';
COMMENT ON COLUMN public.orders.archived_at IS 'Timestamp when the order was archived';
