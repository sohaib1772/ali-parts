
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Order became cancelled → return items to stock
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
    UPDATE public.products p
       SET stock_qty = p.stock_qty + oi.quantity,
           in_stock = CASE WHEN (p.stock_qty + oi.quantity) > 0 THEN true ELSE p.in_stock END
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id AND oi.product_id = p.id;

  -- Order un-cancelled → re-decrement stock
  ELSIF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.products p
       SET stock_qty = GREATEST(0, p.stock_qty - oi.quantity),
           in_stock = CASE WHEN GREATEST(0, p.stock_qty - oi.quantity) = 0 THEN false ELSE p.in_stock END
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_stock_on_cancel
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restore_stock_on_cancel();

-- Restore stock when a non-cancelled order is deleted
CREATE OR REPLACE FUNCTION public.restore_stock_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.products p
       SET stock_qty = p.stock_qty + oi.quantity,
           in_stock = CASE WHEN (p.stock_qty + oi.quantity) > 0 THEN true ELSE p.in_stock END
      FROM public.order_items oi
     WHERE oi.order_id = OLD.id AND oi.product_id = p.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_delete ON public.orders;
CREATE TRIGGER trg_restore_stock_on_delete
BEFORE DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restore_stock_on_delete();
