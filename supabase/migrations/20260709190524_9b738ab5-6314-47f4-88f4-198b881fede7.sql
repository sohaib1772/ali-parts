ALTER TABLE public.staff_permissions ADD COLUMN IF NOT EXISTS can_moderate_comments boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.staff_can(_uid uuid, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _perm = 'orders' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_orders);
  ELSIF _perm = 'products' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_products);
  ELSIF _perm = 'replacements' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_replacements);
  ELSIF _perm = 'block' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_block);
  ELSIF _perm = 'moderate_comments' THEN
    RETURN EXISTS(SELECT 1 FROM public.staff_permissions WHERE user_id = _uid AND can_moderate_comments);
  END IF;
  RETURN false;
END;
$function$;

DROP POLICY IF EXISTS "staff delete banner comments" ON public.banner_comments;
CREATE POLICY "staff delete banner comments" ON public.banner_comments
  FOR DELETE TO authenticated
  USING (public.staff_can(auth.uid(), 'moderate_comments'));