
-- Replacement requests table
CREATE TYPE public.replacement_status AS ENUM ('pending', 'in_review', 'approved', 'rejected', 'resolved');

CREATE TABLE public.replacement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_ar TEXT,
  reason TEXT NOT NULL,
  status public.replacement_status NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replacement_requests_user ON public.replacement_requests(user_id);
CREATE INDEX idx_replacement_requests_status ON public.replacement_requests(status);
CREATE INDEX idx_replacement_requests_created ON public.replacement_requests(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.replacement_requests TO authenticated;
GRANT ALL ON public.replacement_requests TO service_role;

ALTER TABLE public.replacement_requests ENABLE ROW LEVEL SECURITY;

-- Users can view own requests
CREATE POLICY "users view own replacement requests"
ON public.replacement_requests FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Users can insert own requests
CREATE POLICY "users insert own replacement requests"
ON public.replacement_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "admins view all replacement requests"
ON public.replacement_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update
CREATE POLICY "admins update replacement requests"
ON public.replacement_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete
CREATE POLICY "admins delete replacement requests"
ON public.replacement_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER update_replacement_requests_updated_at
BEFORE UPDATE ON public.replacement_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify user when status changes
CREATE OR REPLACE FUNCTION public.notify_replacement_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_title := CASE NEW.status::text
    WHEN 'in_review' THEN 'قسم الاستبدال يراجع طلبك'
    WHEN 'approved' THEN 'تمت الموافقة على طلب الاستبدال'
    WHEN 'rejected' THEN 'تم رفض طلب الاستبدال'
    WHEN 'resolved' THEN 'تم إنجاز طلب الاستبدال'
    ELSE 'تحديث على طلب الاستبدال'
  END;

  v_body := COALESCE('المنتج: ' || NEW.product_name_ar, 'طلب استبدال');

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (NEW.user_id, 'replacement_status', v_title, v_body);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_replacement_status
AFTER UPDATE ON public.replacement_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_replacement_status_change();
