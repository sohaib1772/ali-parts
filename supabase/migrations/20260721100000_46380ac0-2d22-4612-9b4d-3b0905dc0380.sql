-- Account deletion (App Store / Play Store requirement).
--
-- THE CASCADE TRAP
-- Every public table FK'd to auth.users was ON DELETE CASCADE, including
-- `orders`. Deleting an auth user therefore destroyed the shop's sales record
-- for that customer (and, via orders, order_items / notifications /
-- replacement_requests / replacement_status_log). That contradicts privacy
-- policy §6, which promises order records are retained for accounting.
--
-- This migration breaks that link BEFORE any deletion path exists:
--   orders.user_id                -> ON DELETE SET NULL  (sales record survives)
--   replacement_requests.user_id  -> ON DELETE SET NULL  (see note below)
-- and then adds delete_my_account().
--
-- replacement_requests: set to SET NULL rather than left cascading, because
-- retention is the REVERSIBLE choice — rows can always be deleted later, but
-- deleted rows cannot be recovered. A replacement request is a warranty claim
-- attached to a retained order; dropping it leaves a gap in that order's
-- history. Flip the constraint back to ON DELETE CASCADE if the decision is to
-- delete them instead.
--
-- Tables NOT affected (verified): order_items, notifications and
-- replacement_status_log FK to orders / replacement_requests, not to
-- auth.users, so they follow their parent and survive automatically.
-- stock_movements.actor_id has no FK at all, so the inventory audit trail is
-- untouched. price_update_backups.actor_id and user_block_log.actor_id were
-- already SET NULL.

-- ---------------------------------------------------------------------------
-- 1. Sales records must survive account deletion.
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.replacement_requests ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.replacement_requests DROP CONSTRAINT IF EXISTS replacement_requests_user_id_fkey;
ALTER TABLE public.replacement_requests
  ADD CONSTRAINT replacement_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. delete_my_account()
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because a user cannot delete from auth.users under RLS.
-- Takes NO parameter: the account acted on is always auth.uid(), so a caller
-- cannot delete somebody else's account by passing a different id.
-- plpgsql functions run inside the caller's transaction, so either every step
-- below commits or none of them do — a partial delete cannot happen.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text;
  v_phone text;
  v_orders integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT full_name, phone INTO v_name, v_phone
  FROM public.profiles WHERE id = v_user;

  -- Preserve the customer's contact details inside each order's own address
  -- snapshot before the profile row and the user link disappear. Without this
  -- the retained order would still hold a delivery address but could lose the
  -- name/phone, leaving the accounting record unusable. Existing snapshot
  -- values win; we only fill blanks.
  UPDATE public.orders o
  SET address = COALESCE(o.address, '{}'::jsonb) || jsonb_build_object(
        'full_name', COALESCE(NULLIF(o.address->>'full_name', ''), v_name, 'حساب محذوف'),
        'phone',     COALESCE(NULLIF(o.address->>'phone', ''), v_phone, ''),
        'account_deleted_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
  WHERE o.user_id = v_user;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  -- Personal data — deleted.
  DELETE FROM public.cart_items         WHERE user_id = v_user;
  DELETE FROM public.favorites          WHERE user_id = v_user;
  DELETE FROM public.addresses          WHERE user_id = v_user;
  DELETE FROM public.push_subscriptions WHERE user_id = v_user;
  DELETE FROM public.notifications      WHERE user_id = v_user;
  DELETE FROM public.banner_comments    WHERE user_id = v_user;
  DELETE FROM public.banner_likes       WHERE user_id = v_user;
  DELETE FROM public.user_roles         WHERE user_id = v_user;
  DELETE FROM public.staff_permissions  WHERE user_id = v_user;

  -- NOTE: the uploaded avatar is NOT removed here. Supabase installs a
  -- storage.protect_delete() trigger that rejects direct DELETEs on
  -- storage.objects ("Use the Storage API instead"), which would abort this
  -- whole transaction. storage.objects has no FK to auth.users either, so the
  -- row is not cascaded. The client therefore removes the avatar via the
  -- Storage API immediately before calling this function; a failure there is
  -- non-fatal and simply leaves an orphaned image.

  DELETE FROM public.profiles WHERE id = v_user;

  -- Finally the auth row. Cascades identities / sessions / mfa_factors etc.
  -- orders and replacement_requests are SET NULL, so they survive.
  DELETE FROM auth.users WHERE id = v_user;

  RETURN jsonb_build_object('deleted', true, 'orders_retained', v_orders);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
