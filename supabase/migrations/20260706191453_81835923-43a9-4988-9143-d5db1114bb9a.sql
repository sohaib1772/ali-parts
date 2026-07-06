
-- 1) Table
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_ar TEXT,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  order_id UUID,
  order_number TEXT,
  actor_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins view stock movements" ON public.stock_movements;
CREATE POLICY "admins view stock movements"
ON public.stock_movements FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2) Log on order placement (order_items insert)
CREATE OR REPLACE FUNCTION public.log_stock_on_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_num TEXT;
  v_actor UUID;
BEGIN
  SELECT order_number, user_id INTO v_order_num, v_actor
    FROM public.orders WHERE id = NEW.order_id;
  INSERT INTO public.stock_movements (product_id, product_name_ar, delta, reason, order_id, order_number, actor_id, note)
  VALUES (NEW.product_id, NEW.name_ar, -NEW.quantity, 'order_placed', NEW.order_id, v_order_num, v_actor,
          'إنشاء طلب #' || COALESCE(v_order_num, substr(NEW.order_id::text, 1, 8)));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stock_on_order_item ON public.order_items;
CREATE TRIGGER trg_log_stock_on_order_item
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.log_stock_on_order_item();

-- 3) Extend cancel/uncancel to also log
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' AND NEW.status = 'cancelled' THEN
    UPDATE public.products p
       SET stock_qty = p.stock_qty + oi.quantity,
           in_stock = CASE WHEN (p.stock_qty + oi.quantity) > 0 THEN true ELSE p.in_stock END
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id AND oi.product_id = p.id;

    INSERT INTO public.stock_movements (product_id, product_name_ar, delta, reason, order_id, order_number, actor_id, note)
    SELECT oi.product_id, oi.name_ar, oi.quantity, 'order_cancelled', NEW.id, NEW.order_number, v_actor,
           'إلغاء طلب #' || COALESCE(NEW.order_number, substr(NEW.id::text, 1, 8))
      FROM public.order_items oi WHERE oi.order_id = NEW.id;

  ELSIF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.products p
       SET stock_qty = GREATEST(0, p.stock_qty - oi.quantity),
           in_stock = CASE WHEN GREATEST(0, p.stock_qty - oi.quantity) = 0 THEN false ELSE p.in_stock END
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id AND oi.product_id = p.id;

    INSERT INTO public.stock_movements (product_id, product_name_ar, delta, reason, order_id, order_number, actor_id, note)
    SELECT oi.product_id, oi.name_ar, -oi.quantity, 'order_uncancelled', NEW.id, NEW.order_number, v_actor,
           'إعادة تفعيل طلب #' || COALESCE(NEW.order_number, substr(NEW.id::text, 1, 8))
      FROM public.order_items oi WHERE oi.order_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Extend delete to also log
CREATE OR REPLACE FUNCTION public.restore_stock_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.products p
       SET stock_qty = p.stock_qty + oi.quantity,
           in_stock = CASE WHEN (p.stock_qty + oi.quantity) > 0 THEN true ELSE p.in_stock END
      FROM public.order_items oi
     WHERE oi.order_id = OLD.id AND oi.product_id = p.id;

    INSERT INTO public.stock_movements (product_id, product_name_ar, delta, reason, order_id, order_number, actor_id, note)
    SELECT oi.product_id, oi.name_ar, oi.quantity, 'order_deleted', OLD.id, OLD.order_number, v_actor,
           'حذف طلب #' || COALESCE(OLD.order_number, substr(OLD.id::text, 1, 8))
      FROM public.order_items oi WHERE oi.order_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;
