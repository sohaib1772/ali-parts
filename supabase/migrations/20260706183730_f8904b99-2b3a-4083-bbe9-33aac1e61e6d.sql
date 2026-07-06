
CREATE TABLE public.replacement_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.replacement_requests(id) ON DELETE CASCADE,
  status public.replacement_status NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_replacement_status_log_request ON public.replacement_status_log(request_id, created_at);

GRANT SELECT, INSERT ON public.replacement_status_log TO authenticated;
GRANT ALL ON public.replacement_status_log TO service_role;

ALTER TABLE public.replacement_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own replacement log"
ON public.replacement_status_log FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.replacement_requests r
  WHERE r.id = replacement_status_log.request_id
    AND r.user_id = auth.uid()
));

CREATE POLICY "admins view all replacement log"
ON public.replacement_status_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Insert on create
CREATE OR REPLACE FUNCTION public.log_replacement_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.replacement_status_log (request_id, status, note)
  VALUES (NEW.id, NEW.status, 'تم إنشاء طلب الاستبدال');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_replacement_created
AFTER INSERT ON public.replacement_requests
FOR EACH ROW EXECUTE FUNCTION public.log_replacement_created();

-- Insert on status change
CREATE OR REPLACE FUNCTION public.log_replacement_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.replacement_status_log (request_id, status, note)
    VALUES (NEW.id, NEW.status, NEW.admin_notes);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_replacement_status_change
AFTER UPDATE ON public.replacement_requests
FOR EACH ROW EXECUTE FUNCTION public.log_replacement_status_change();
