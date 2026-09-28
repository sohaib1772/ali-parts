-- Add has_side_options boolean to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS has_side_options BOOLEAN NOT NULL DEFAULT true;

-- Ensure all existing products explicitly have has_side_options = true
UPDATE public.products
SET has_side_options = true
WHERE has_side_options IS NULL;

-- Add a helpful comment
COMMENT ON COLUMN public.products.has_side_options IS 'Indicates whether the product supports side selection (LH, RH, PAIR) or is a standalone item with no sides';
