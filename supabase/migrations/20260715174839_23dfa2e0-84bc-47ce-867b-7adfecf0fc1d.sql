--------------------------------------------------------------------------------
-- Audit Step 3: server-side cancel RPC + app_settings anon allowlist
--------------------------------------------------------------------------------

-- ITEM A: customer order cancellation via a SECURITY DEFINER RPC.
--   Step 2 removed the customer's direct DELETE and guarded the UPDATE policy; this
--   gives the app an explicit, re-validated cancel path that returns a clear Arabic
--   error for late-stage orders.
--   NOTE: existing AFTER-UPDATE triggers on orders already handle the side effects of
--   a status change to 'cancelled' — restore_stock_on_cancel (stock + stock_movements),
--   adjust_sales_on_cancel (sales_count), handle_order_status_change (points refund),
--   notify/audit. So this function ONLY sets the status; it must NOT duplicate that logic.
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status order_status;
BEGIN
  SELECT status INTO v_status FROM public.orders
   WHERE id = p_order_id AND user_id = auth.uid()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;
  IF v_status NOT IN ('received','preparing') THEN
    RAISE EXCEPTION 'لا يمكن إلغاء الطلب بعد تجهيزه';
  END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.cancel_my_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(uuid) TO authenticated;

-- ITEM B: flip app_settings anon SELECT from a DENYLIST to an ALLOWLIST.
--   Old policy exposed every key to anon EXCEPT push_config / push_trigger_secret, so any
--   future secret (e.g. external_api_key) would be world-readable the moment it was added.
--   New policy exposes ONLY the verified public storefront/config keys; every other key —
--   including all secrets, current and future — is denied to anon by default.
DROP POLICY IF EXISTS "anon read public settings" ON public.app_settings;

CREATE POLICY "anon reads only public settings"
  ON public.app_settings
  FOR SELECT
  TO anon
  USING (key = ANY (ARRAY[
    -- store identity / contact (read by the storefront header, footer, about, contact)
    'store_name','store_about','store_address','store_tagline','store_owner',
    'store_email','store_logo','store_years','store_location_link','store_front_image',
    'phone_number','whatsapp_number',
    -- public pricing config (product cards / detail apply these to displayed prices)
    'usd_exchange_rate','usd_rounding','global_price_adjustment_iqd',
    -- public shipping config (non-secret store shipping options)
    'ship_local_cost','ship_local_name','ship_aramex_cost','ship_aramex_name'
  ]::text[]));

-- Excluded from anon (secrets / internal): external_api_key, external_api_base_url,
--   external_api_key_header, external_api_endpoints, push_config, push_trigger_secret,
--   and anything added later (default-deny).
--
-- authenticated read policy ("authenticated read non-sensitive settings") and the admin
-- write policy ("admins write settings") are intentionally left unchanged.
