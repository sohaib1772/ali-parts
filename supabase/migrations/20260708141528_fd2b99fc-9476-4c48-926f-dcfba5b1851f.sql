
-- 1) Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_id);

-- 2) Grants
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- 3) RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 4) Trigger: order created
CREATE OR REPLACE FUNCTION public.audit_order_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'order_created',
    'order',
    NEW.id::text,
    jsonb_build_object(
      'order_number', NEW.order_number,
      'user_id', NEW.user_id,
      'total_iqd', NEW.total_iqd,
      'payment_method', NEW.payment_method,
      'status', NEW.status
    )
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_order_created ON public.orders;
CREATE TRIGGER trg_audit_order_created
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_created();

-- 5) Trigger: order status change
CREATE OR REPLACE FUNCTION public.audit_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      'order_status_changed',
      'order',
      NEW.id::text,
      jsonb_build_object(
        'order_number', NEW.order_number,
        'user_id', NEW.user_id,
        'old_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_order_status_change ON public.orders;
CREATE TRIGGER trg_audit_order_status_change
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_status_change();

-- 6) Trigger: replacement status change
CREATE OR REPLACE FUNCTION public.audit_replacement_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      'replacement_status_changed',
      'replacement_request',
      NEW.id::text,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'product_name_ar', NEW.product_name_ar,
        'admin_notes', NEW.admin_notes
      )
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_replacement_status_change ON public.replacement_requests;
CREATE TRIGGER trg_audit_replacement_status_change
AFTER UPDATE ON public.replacement_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_replacement_status_change();

-- 7) Trigger: user blocked/unblocked (from user_block_log)
CREATE OR REPLACE FUNCTION public.audit_user_block()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    NEW.actor_id,
    CASE WHEN NEW.action = 'block' THEN 'user_blocked' ELSE 'user_unblocked' END,
    'user',
    NEW.user_id::text,
    jsonb_build_object('action', NEW.action)
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_user_block ON public.user_block_log;
CREATE TRIGGER trg_audit_user_block
AFTER INSERT ON public.user_block_log
FOR EACH ROW EXECUTE FUNCTION public.audit_user_block();

-- 8) Trigger: new banner created by admin
CREATE OR REPLACE FUNCTION public.audit_banner_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'banner_created',
    'banner',
    NEW.id::text,
    jsonb_build_object(
      'title_ar', NEW.title_ar,
      'is_active', NEW.is_active
    )
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_banner_created ON public.banners;
CREATE TRIGGER trg_audit_banner_created
AFTER INSERT ON public.banners
FOR EACH ROW EXECUTE FUNCTION public.audit_banner_created();

-- 9) Manual admin logging function (for broadcast notifications, etc.)
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_actor, 'admin') OR public.is_staff(v_actor)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_action IS NULL OR btrim(p_action) = '' OR p_entity_type IS NULL OR btrim(p_entity_type) = '' THEN
    RAISE EXCEPTION 'action and entity_type are required';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor, p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT, TEXT, TEXT, JSONB) TO authenticated;
