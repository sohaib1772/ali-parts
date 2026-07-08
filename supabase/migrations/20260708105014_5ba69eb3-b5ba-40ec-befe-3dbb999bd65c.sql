
-- 1) Seed canonical settings (idempotent)
INSERT INTO public.app_settings(key, value)
VALUES ('usd_exchange_rate', '1500'), ('usd_rounding', '500')
ON CONFLICT (key) DO NOTHING;

-- 2) Backfill price_usd from price_iqd where it looks wrong or missing
--    Use current rate 1500 as base. Only touch rows where price_usd is clearly inconsistent.
UPDATE public.products
SET price_usd = ROUND((price_iqd / 1500.0)::numeric, 2)
WHERE price_iqd > 0
  AND (
    price_usd IS NULL
    OR price_usd = 0
    OR ABS(price_usd * 1500 - price_iqd) > (price_iqd * 0.30)
  );

-- 3) Compute IQD from USD with rounding
CREATE OR REPLACE FUNCTION public.compute_iqd_from_usd(_usd numeric, _rate numeric, _rounding numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_usd, 0) <= 0 THEN 0
    WHEN COALESCE(_rounding, 0) <= 0 THEN ROUND(_usd * _rate)
    ELSE ROUND(_usd * _rate / _rounding) * _rounding
  END
$$;

-- 4) BEFORE INSERT/UPDATE trigger on products: auto-sync price_iqd from price_usd
CREATE OR REPLACE FUNCTION public.products_sync_iqd_from_usd()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rate numeric := 1500;
  v_round numeric := 500;
BEGIN
  SELECT COALESCE(NULLIF(btrim(value), '')::numeric, 1500) INTO v_rate
    FROM public.app_settings WHERE key = 'usd_exchange_rate';
  SELECT COALESCE(NULLIF(btrim(value), '')::numeric, 500) INTO v_round
    FROM public.app_settings WHERE key = 'usd_rounding';

  IF NEW.price_usd IS NOT NULL AND NEW.price_usd > 0 THEN
    NEW.price_iqd := public.compute_iqd_from_usd(NEW.price_usd, v_rate, v_round);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_sync_iqd_from_usd_trg ON public.products;
CREATE TRIGGER products_sync_iqd_from_usd_trg
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_sync_iqd_from_usd();

-- 5) Recalc all IQD prices in bulk (called after rate/rounding change)
CREATE OR REPLACE FUNCTION public.recalc_all_products_iqd()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric := 1500;
  v_round numeric := 500;
  v_count integer := 0;
BEGIN
  SELECT COALESCE(NULLIF(btrim(value), '')::numeric, 1500) INTO v_rate
    FROM public.app_settings WHERE key = 'usd_exchange_rate';
  SELECT COALESCE(NULLIF(btrim(value), '')::numeric, 500) INTO v_round
    FROM public.app_settings WHERE key = 'usd_rounding';

  UPDATE public.products
  SET price_iqd = public.compute_iqd_from_usd(price_usd, v_rate, v_round)
  WHERE price_usd IS NOT NULL AND price_usd > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6) Trigger on app_settings: when rate/rounding is upserted, recalc all products
CREATE OR REPLACE FUNCTION public.app_settings_recalc_on_rate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key IN ('usd_exchange_rate', 'usd_rounding') THEN
    IF TG_OP = 'UPDATE' AND NEW.value IS NOT DISTINCT FROM OLD.value THEN
      RETURN NEW;
    END IF;
    PERFORM public.recalc_all_products_iqd();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_settings_recalc_on_rate_change_trg ON public.app_settings;
CREATE TRIGGER app_settings_recalc_on_rate_change_trg
AFTER INSERT OR UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.app_settings_recalc_on_rate_change();

-- 7) Initial recalc using seeded rate
SELECT public.recalc_all_products_iqd();
