-- supabase/seed.sql — LOCAL/DEV seed data. Runs automatically after migrations on
-- `supabase db reset`. Non-secret configuration defaults only (safe to commit).
--
-- Purpose: guarantee the app_settings keys that the SERVER-SIDE pricing path reads
-- (with no code fallback) exist on a fresh database, so place_order and the
-- products price-sync trigger produce correct totals without manual admin-UI setup.
-- Idempotent: ON CONFLICT DO NOTHING never overwrites an existing value.
--
-- Keys and why they matter:
--   global_price_adjustment_iqd — read by public.place_order(). If the row is MISSING,
--       SELECT ... INTO assigns NULL and GREATEST(0, subtotal + NULL) = 0 zeroes the
--       order total. This is the only pricing key NOT already seeded by a migration.
--   usd_exchange_rate / usd_rounding — read by public.products_sync_iqd_from_usd()
--       (recomputes products.price_iqd from price_usd). Already migration-seeded, but
--       listed here so a standalone seed run leaves a fully-priced dev database.
--   whatsapp_number — read by the storefront (contact/checkout). Already migration-seeded;
--       included for a complete dev environment.

INSERT INTO public.app_settings (key, value) VALUES
  ('global_price_adjustment_iqd', '0'),
  ('usd_exchange_rate',           '1500'),
  ('usd_rounding',                '500'),
  ('whatsapp_number',             '9647800000000')
ON CONFLICT (key) DO NOTHING;
