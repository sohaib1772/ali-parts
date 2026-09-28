-- ---------------------------------------------------------------------------
-- Migration: Add dialect_names column to products for dialect-aware search
-- ---------------------------------------------------------------------------

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dialect_names TEXT;

COMMENT ON COLUMN public.products.dialect_names IS 'Alternative dialect names and synonyms for search indexing, hidden from customers';

-- Index for fast case-insensitive pattern matching
CREATE INDEX IF NOT EXISTS idx_products_dialect_names ON public.products(dialect_names) WHERE dialect_names IS NOT NULL;
