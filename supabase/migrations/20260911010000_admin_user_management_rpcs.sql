-- Migration: admin_user_management_rpcs
-- Exposes secure RPC functions for admin to manage user roles and delete accounts directly

-- ---------------------------------------------------------------------------
-- 1. admin_delete_user(p_user_id uuid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_name text;
  v_phone text;
  v_orders integer := 0;
BEGIN
  -- 1. Authentication and Authorization check
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_admin AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can delete user accounts';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF p_user_id = v_admin THEN
    RAISE EXCEPTION 'لا يمكنك حذف حسابك الإداري الحالي.';
  END IF;

  -- 2. Fetch profile data for address snapshot preservation
  SELECT full_name, phone INTO v_name, v_phone
  FROM public.profiles WHERE id = p_user_id;

  -- 3. Preserve snapshot in orders and decouple user_id
  UPDATE public.orders o
  SET user_id = NULL,
      address = COALESCE(o.address, '{}'::jsonb) || jsonb_build_object(
        'full_name', COALESCE(NULLIF(o.address->>'full_name', ''), v_name, 'حساب محذوف'),
        'phone',     COALESCE(NULLIF(o.address->>'phone', ''), v_phone, ''),
        'account_deleted_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
  WHERE o.user_id = p_user_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  -- 4. Decouple replacement requests
  UPDATE public.replacement_requests
  SET user_id = NULL
  WHERE user_id = p_user_id;

  -- 5. Delete personal records
  DELETE FROM public.cart_items         WHERE user_id = p_user_id;
  DELETE FROM public.favorites          WHERE user_id = p_user_id;
  DELETE FROM public.addresses          WHERE user_id = p_user_id;
  DELETE FROM public.push_subscriptions WHERE user_id = p_user_id;
  DELETE FROM public.notifications      WHERE user_id = p_user_id;
  DELETE FROM public.banner_comments    WHERE user_id = p_user_id;
  DELETE FROM public.banner_likes       WHERE user_id = p_user_id;
  DELETE FROM public.user_roles         WHERE user_id = p_user_id;
  DELETE FROM public.staff_permissions  WHERE user_id = p_user_id;

  -- OTP entries if tables exist
  BEGIN
    DELETE FROM public.admin_otp_verifications WHERE user_id = p_user_id;
    DELETE FROM public.admin_otp_challenges   WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN
    -- Ignore if OTP tables do not exist
  END;

  -- 6. Delete profile
  DELETE FROM public.profiles WHERE id = p_user_id;

  -- 7. Delete auth user
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'orders_retained', v_orders);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. admin_set_user_role(p_user_id, p_role_type, ...)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid,
  p_role_type text,
  p_can_orders boolean DEFAULT false,
  p_can_products boolean DEFAULT false,
  p_can_replacements boolean DEFAULT false,
  p_can_block boolean DEFAULT false,
  p_can_moderate_comments boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_name text;
BEGIN
  -- 1. Check admin permission
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_admin AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can modify user roles';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;

  IF p_role_type = 'admin' THEN
    -- Set Admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    DELETE FROM public.staff_permissions WHERE user_id = p_user_id;

  ELSIF p_role_type = 'staff' THEN
    -- Remove Admin role
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin';

    SELECT full_name INTO v_name FROM public.profiles WHERE id = p_user_id;

    INSERT INTO public.staff_permissions (
      user_id, full_name, can_orders, can_products, can_replacements, can_block, can_moderate_comments, updated_at
    )
    VALUES (
      p_user_id,
      COALESCE(v_name, 'موظف'),
      COALESCE(p_can_orders, false),
      COALESCE(p_can_products, false),
      COALESCE(p_can_replacements, false),
      COALESCE(p_can_block, false),
      COALESCE(p_can_moderate_comments, false),
      now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      can_orders = EXCLUDED.can_orders,
      can_products = EXCLUDED.can_products,
      can_replacements = EXCLUDED.can_replacements,
      can_block = EXCLUDED.can_block,
      can_moderate_comments = EXCLUDED.can_moderate_comments,
      updated_at = now();

  ELSE
    -- Regular customer / user
    IF p_user_id = v_admin THEN
      RAISE EXCEPTION 'لا يمكنك إزالة صلاحيات الإدارة عن نفسك.';
    END IF;

    DELETE FROM public.user_roles WHERE user_id = p_user_id;
    DELETE FROM public.staff_permissions WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'role_type', p_role_type);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text, boolean, boolean, boolean, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text, boolean, boolean, boolean, boolean, boolean) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. admin_get_users_list()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_users_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_users jsonb;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_admin AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can list users with role details';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'phone', COALESCE(p.phone, u.phone),
      'email', u.email,
      'avatar_url', p.avatar_url,
      'is_blocked', COALESCE(p.is_blocked, false),
      'points_balance', COALESCE(p.points_balance, 0),
      'created_at', p.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'is_admin', (ur.role = 'admin'),
      'is_staff', (sp.user_id IS NOT NULL AND (sp.can_orders OR sp.can_products OR sp.can_replacements OR sp.can_block OR sp.can_moderate_comments)),
      'staff_permissions', CASE WHEN sp.user_id IS NOT NULL THEN
        jsonb_build_object(
          'can_orders', sp.can_orders,
          'can_products', sp.can_products,
          'can_replacements', sp.can_replacements,
          'can_block', sp.can_block,
          'can_moderate_comments', sp.can_moderate_comments
        )
      ELSE NULL END
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb) INTO v_users
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
  LEFT JOIN public.staff_permissions sp ON sp.user_id = p.id;

  RETURN v_users;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_users_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users_list() TO authenticated;
