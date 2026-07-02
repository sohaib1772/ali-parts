CREATE OR REPLACE FUNCTION public.handle_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  earn integer;
BEGIN
  IF OLD.status IS DISTINCT FROM 'delivered' AND NEW.status = 'delivered' THEN
    earn := (FLOOR(COALESCE(NEW.subtotal_iqd, 0) / 10000) * 100)::int;
    IF earn > 0 THEN
      NEW.points_earned := earn;
      PERFORM set_config('app.allow_points_change', 'yes', true);
      UPDATE public.profiles SET points_balance = points_balance + earn WHERE id = NEW.user_id;
      PERFORM set_config('app.allow_points_change', '', true);
    END IF;
  END IF;

  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' AND OLD.status <> 'delivered' THEN
    IF COALESCE(NEW.points_used, 0) > 0 THEN
      PERFORM set_config('app.allow_points_change', 'yes', true);
      UPDATE public.profiles SET points_balance = points_balance + NEW.points_used WHERE id = NEW.user_id;
      PERFORM set_config('app.allow_points_change', '', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;