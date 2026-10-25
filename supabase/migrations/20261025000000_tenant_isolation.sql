-- Tenant isolation (audit #1) and legacy table lockdown (audit #6).
--
-- Before: every signed-in user could read and change every organisation's drivers,
-- bookings, cash handovers, pricing and routes, and email sign-up is open. The old
-- "bookings table" and "Drivers" tables were readable and writable with the public key.
--
-- After: only an organisation's admin (organizations.admin_user_id) or a super admin
-- can touch that organisation's rows. Customers book through create_customer_booking()
-- and follow their booking with a private tracking token. Secret org columns are hidden.
--
-- Additive and safe to re-run. No rows are deleted.

BEGIN;

-- 1. Link the existing admin to the Anil Cabs org, or the new rules would lock them out.
UPDATE public.organizations
   SET admin_user_id = (SELECT id FROM auth.users WHERE email = 'shivamjindal076@gmail.com')
 WHERE slug = 'anilcabs' AND admin_user_id IS NULL;

-- 2. Who administers an organisation. SECURITY DEFINER so it can read the tables
--    the policies below protect, without recursing into those policies.
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_org AND o.admin_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.super_admin_users s WHERE s.user_id = auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO anon, authenticated;

-- 3. Organisations: public branding stays readable; secrets do not; only the org's admin updates.
REVOKE SELECT ON public.organizations FROM anon, authenticated;
GRANT SELECT (id, name, slug, custom_domain, brand_name, brand_logo_url, brand_color, join_code,
              upi_id, upi_qr_url, google_review_url, report_frequency_days, created_at)
  ON public.organizations TO anon, authenticated;

DROP POLICY IF EXISTS "auth_update_organizations" ON public.organizations;
CREATE POLICY "org_admin_update_organizations" ON public.organizations
  FOR UPDATE TO authenticated USING (public.is_org_admin(id)) WITH CHECK (public.is_org_admin(id));

-- 4. Org-scoped tables: admins of the row's org only.
DROP POLICY IF EXISTS "auth_all_drivers" ON public.drivers;
CREATE POLICY "org_admin_all_drivers" ON public.drivers
  FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
-- anon_read_drivers stays for now: driver login still looks drivers up by phone (audit #2 replaces it).

DROP POLICY IF EXISTS "auth_all_bookings" ON public.bookings;
DROP POLICY IF EXISTS "anon_insert_bookings" ON public.bookings;
CREATE POLICY "org_admin_all_bookings" ON public.bookings
  FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "auth_all_handovers" ON public.cash_handovers_v2;
CREATE POLICY "org_admin_all_handovers" ON public.cash_handovers_v2
  FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "auth_all_pricing" ON public.org_pricing;
CREATE POLICY "org_admin_all_pricing" ON public.org_pricing
  FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "auth_all_routes" ON public.fixed_routes_v2;
CREATE POLICY "org_admin_all_routes" ON public.fixed_routes_v2
  FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- 5. Customer booking. Customers cannot read the bookings table, so the booking is created
--    by a function that returns its id and a private tracking token.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS tracking_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS bookings_tracking_token_idx ON public.bookings (tracking_token);

CREATE OR REPLACE FUNCTION public.create_customer_booking(p_org_id uuid, p_booking jsonb)
RETURNS TABLE (booking_id bigint, booking_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.bookings%ROWTYPE;
  v_id bigint;
  v_token uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_org_id) THEN
    RAISE EXCEPTION 'Unknown organisation';
  END IF;
  r := jsonb_populate_record(NULL::public.bookings, p_booking);
  IF coalesce(trim(r.pickup), '') = '' THEN
    RAISE EXCEPTION 'Pickup is required';
  END IF;

  -- Status, driver, payment progress and timestamps are never taken from the customer.
  INSERT INTO public.bookings AS b (org_id, customer_name, customer_phone, pickup, "drop", scheduled_at,
                                    trip_type, fare, payment_method, notes, stops, estimated_hours,
                                    return_date, number_of_days, driver_stay_required, status)
  VALUES (p_org_id, left(r.customer_name, 120), left(r.customer_phone, 20), left(r.pickup, 300), left(r."drop", 300),
          coalesce(r.scheduled_at, now()), r.trip_type, r.fare, r.payment_method, left(r.notes, 1000), r.stops,
          r.estimated_hours, r.return_date, r.number_of_days, r.driver_stay_required, 'pending')
  RETURNING b.id, b.tracking_token INTO v_id, v_token;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_booking(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_customer_booking(uuid, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_booking_status(p_token uuid)
RETURNS TABLE (id bigint, status text, scheduled_at timestamptz, pickup text, "drop" text,
               driver_name text, driver_phone text, vehicle_model text, plate_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id, b.status::text, b.scheduled_at, b.pickup, b."drop",
         d.name, d.phone, d.vehicle_model, d.plate_number
    FROM public.bookings b
    LEFT JOIN public.drivers d ON d.id = b.driver_id
   WHERE b.tracking_token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_booking_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_booking_status(uuid) TO anon, authenticated;

-- 6. Legacy tables the app no longer uses: close them to the public key and to
--    signed-in users. Data is kept; drop the tables once you have confirmed it is not needed.
DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookings table', 'Drivers', 'fixed_routes'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
      END LOOP;
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
