--------------------------------------------------------------------------------
-- Audit Step 4: server-side admin-OTP check helper + app_settings authenticated allowlist
--------------------------------------------------------------------------------

-- ITEM A: SECURITY DEFINER helper so the server can verify OTP state without service_role.
--   admin_otp_verifications is RLS-locked ("no direct access" USING false), so a plain
--   authenticated client cannot read it. This function runs as owner and returns TRUE only
--   when the calling user (auth.uid()) has a NON-EXPIRED verification row for the given
--   device_id — the same (user_id, device_id, expires_at) check adminOtpStatus uses.
CREATE OR REPLACE FUNCTION public.admin_otp_verified(p_device_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_otp_verifications v
    WHERE v.user_id = auth.uid()
      AND v.device_id = COALESCE(p_device_id, '')
      AND v.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.admin_otp_verified(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_otp_verified(text) TO authenticated;

-- ITEM B: apply the Step-3 anon allowlist to the AUTHENTICATED read policy too.
--   A logged-in customer must NOT be able to read secret keys (external_api_*, push_*).
--   Admins keep full access via "admins write settings" (FOR ALL). service_role bypasses RLS.
DROP POLICY IF EXISTS "authenticated read non-sensitive settings" ON public.app_settings;

CREATE POLICY "authenticated reads only public settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (
    -- admins may read everything (needed by the admin UI to manage external_api_key etc.)
    has_role(auth.uid(), 'admin'::app_role)
    -- everyone else (plain customers): only the public storefront/config keys
    OR key = ANY (ARRAY[
      'store_name','store_about','store_address','store_tagline','store_owner',
      'store_email','store_logo','store_years','store_location_link','store_front_image',
      'phone_number','whatsapp_number',
      'usd_exchange_rate','usd_rounding','global_price_adjustment_iqd',
      'ship_local_cost','ship_local_name','ship_aramex_cost','ship_aramex_name'
    ]::text[])
  );
