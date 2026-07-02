
-- Add points columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points_balance integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS points_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS points_earned integer NOT NULL DEFAULT 0;

-- Protect profile.points_balance from direct user updates
CREATE OR REPLACE FUNCTION public.protect_points_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.points_balance IS DISTINCT FROM OLD.points_balance
     AND current_setting('app.allow_points_change', true) IS DISTINCT FROM 'yes' THEN
    NEW.points_balance := OLD.points_balance;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_points_balance ON public.profiles;
CREATE TRIGGER trg_protect_points_balance
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_points_balance();

-- Redeem points on order insert
CREATE OR REPLACE FUNCTION public.handle_order_points_redeem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bal integer;
BEGIN
  IF NEW.points_used IS NULL OR NEW.points_used <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT points_balance INTO bal FROM public.profiles WHERE id = NEW.user_id FOR UPDATE;
  IF bal IS NULL THEN
    INSERT INTO public.profiles(id) VALUES (NEW.user_id) ON CONFLICT DO NOTHING;
    bal := 0;
  END IF;
  IF NEW.points_used > bal THEN
    RAISE EXCEPTION 'Insufficient points balance';
  END IF;

  PERFORM set_config('app.allow_points_change', 'yes', true);
  UPDATE public.profiles SET points_balance = points_balance - NEW.points_used WHERE id = NEW.user_id;
  PERFORM set_config('app.allow_points_change', '', true);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_points_redeem ON public.orders;
CREATE TRIGGER trg_order_points_redeem
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_order_points_redeem();

-- Handle status changes: award on delivered, refund on cancel
CREATE OR REPLACE FUNCTION public.handle_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  earn integer;
BEGIN
  -- Award points when delivered
  IF OLD.status IS DISTINCT FROM 'delivered' AND NEW.status = 'delivered' THEN
    earn := FLOOR(COALESCE(NEW.subtotal_iqd, 0) / 1000)::int;
    IF earn > 0 THEN
      NEW.points_earned := earn;
      PERFORM set_config('app.allow_points_change', 'yes', true);
      UPDATE public.profiles SET points_balance = points_balance + earn WHERE id = NEW.user_id;
      PERFORM set_config('app.allow_points_change', '', true);
    END IF;
  END IF;

  -- Refund points if cancelled (and not delivered before)
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' AND OLD.status <> 'delivered' THEN
    IF COALESCE(NEW.points_used, 0) > 0 THEN
      PERFORM set_config('app.allow_points_change', 'yes', true);
      UPDATE public.profiles SET points_balance = points_balance + NEW.points_used WHERE id = NEW.user_id;
      PERFORM set_config('app.allow_points_change', '', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_change ON public.orders;
CREATE TRIGGER trg_order_status_change
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_change();
