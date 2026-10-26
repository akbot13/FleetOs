-- Driver sign-in with an admin-set PIN (audit #2), driver cash that saves (audit #3, #4).
--
-- Before: driver login accepted any 6 digits, driver phone numbers were public, and drivers
-- had no database session, so handovers failed to save and expenses lived only in memory.
--
-- After: the admin sets a 6-digit PIN per driver (stored hashed). The driver app opens an
-- anonymous session and calls driver_sign_in(); a correct phone + PIN links that session to
-- the driver. Five wrong PINs lock the driver for 15 minutes. Drivers then see and change
-- only their own row, trips, handovers and cash entries.
--
-- Needs "Anonymous sign-ins" turned on in Supabase Auth. Anonymous sessions get no access
-- until a PIN matches.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. Which auth session belongs to which driver.
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE INDEX IF NOT EXISTS drivers_auth_user_id_idx ON public.drivers (auth_user_id);

-- 2. PINs live in their own table with no policies: only the functions below can read it.
CREATE TABLE IF NOT EXISTS public.driver_pins (
  driver_id       bigint PRIMARY KEY REFERENCES public.drivers ON DELETE CASCADE,
  pin_hash        text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.driver_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_pins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_driver_id()
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.id FROM public.drivers d WHERE auth.uid() IS NOT NULL AND d.auth_user_id = auth.uid() LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_driver_id() FROM public;
GRANT EXECUTE ON FUNCTION public.my_driver_id() TO anon, authenticated;

-- 3. Admin sets (or resets) a driver's PIN. Resetting also signs the driver out everywhere.
CREATE OR REPLACE FUNCTION public.set_driver_pin(p_driver_id bigint, p_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.drivers WHERE id = p_driver_id;
  IF v_org IS NULL OR NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'Only this fleet''s admin can set a driver PIN';
  END IF;
  IF p_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 digits';
  END IF;
  INSERT INTO sdpublic.driver_pins AS p (driver_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_driver_id, crypt(p_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
  UPDATE public.drivers SET auth_user_id = NULL WHERE id = p_driver_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_driver_pin(bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_driver_pin(bigint, text) TO authenticated;

-- Which drivers already have a PIN, for the admin screen (never the PIN itself).
CREATE OR REPLACE FUNCTION public.drivers_with_pin(p_org_id uuid)
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.driver_id FROM public.driver_pins p JOIN public.drivers d ON d.id = p.driver_id
   WHERE d.org_id = p_org_id AND public.is_org_admin(p_org_id);
$$;
REVOKE ALL ON FUNCTION public.drivers_with_pin(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.drivers_with_pin(uuid) TO authenticated;

-- 4. Driver sign-in. Returns ok/message instead of raising, because raising would roll back
--    the failed-attempt count and make the lockout useless.
CREATE OR REPLACE FUNCTION public.driver_sign_in(p_org_id uuid, p_phone text, p_pin text)
RETURNS TABLE (ok boolean, message text, driver jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  d public.drivers%ROWTYPE;
  p public.driver_pins%ROWTYPE;
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'Could not start a session. Refresh and try again.', NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO d FROM public.drivers
   WHERE org_id = p_org_id AND right(regexp_replace(phone, '\D', '', 'g'), 10) = v_phone
   ORDER BY id LIMIT 1;
  IF d.id IS NULL THEN
    RETURN QUERY SELECT false, 'This number isn''t registered with the fleet.', NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO p FROM public.driver_pins WHERE driver_id = d.id;
  IF p.driver_id IS NULL THEN
    RETURN QUERY SELECT false, 'No PIN set yet. Ask your fleet manager for your PIN.', NULL::jsonb; RETURN;
  END IF;
  IF p.locked_until IS NOT NULL AND p.locked_until > now() THEN
    RETURN QUERY SELECT false, 'Too many wrong PINs. Try again in 15 minutes.', NULL::jsonb; RETURN;
  END IF;

  IF crypt(coalesce(p_pin, ''), p.pin_hash) <> p.pin_hash THEN
    UPDATE public.driver_pins
       SET failed_attempts = CASE WHEN failed_attempts + 1 >= 5 THEN 0 ELSE failed_attempts + 1 END,
           locked_until    = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
     WHERE driver_id = d.id;
    RETURN QUERY SELECT false, 'Wrong PIN.', NULL::jsonb; RETURN;
  END IF;

  UPDATE public.driver_pins SET failed_attempts = 0, locked_until = NULL WHERE driver_id = d.id;
  UPDATE public.drivers SET auth_user_id = auth.uid() WHERE id = d.id;
  RETURN QUERY SELECT true, 'ok', (to_jsonb(d) - 'auth_user_id');
END;
$$;
REVOKE ALL ON FUNCTION public.driver_sign_in(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.driver_sign_in(uuid, text, text) TO anon, authenticated;

-- 5. New drivers can still ask to join; the admin approves them and sets their PIN.
CREATE OR REPLACE FUNCTION public.register_driver(p_org_id uuid, p_phone text, p_name text)
RETURNS TABLE (ok boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
BEGIN
  IF length(v_phone) <> 10 OR coalesce(trim(p_name), '') = '' THEN
    RETURN QUERY SELECT false, 'Enter your name and a 10-digit mobile number.'; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id) THEN
    RETURN QUERY SELECT false, 'Unknown fleet.'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.drivers WHERE org_id = p_org_id AND right(regexp_replace(phone, '\D', '', 'g'), 10) = v_phone) THEN
    RETURN QUERY SELECT false, 'This number is already registered. Ask your fleet manager for your PIN.'; RETURN;
  END IF;
  INSERT INTO public.drivers (org_id, name, phone, status)
  VALUES (p_org_id, left(trim(p_name), 80), '+91' || v_phone, 'pending_approval');
  RETURN QUERY SELECT true, 'Submitted. Your fleet manager will approve you and give you a PIN.';
END;
$$;
REVOKE ALL ON FUNCTION public.register_driver(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_driver(uuid, text, text) TO anon, authenticated;

-- 6. Driver phone numbers are no longer public.
DROP POLICY IF EXISTS "anon_read_drivers" ON public.drivers;

-- 7. What a signed-in driver may do: only their own row, trips and money records.
DROP POLICY IF EXISTS "driver_read_own" ON public.drivers;
CREATE POLICY "driver_read_own" ON public.drivers
  FOR SELECT TO authenticated USING (id = public.my_driver_id());
DROP POLICY IF EXISTS "driver_update_own" ON public.drivers;
CREATE POLICY "driver_update_own" ON public.drivers
  FOR UPDATE TO authenticated USING (id = public.my_driver_id()) WITH CHECK (id = public.my_driver_id());

DROP POLICY IF EXISTS "driver_read_own_trips" ON public.bookings;
CREATE POLICY "driver_read_own_trips" ON public.bookings
  FOR SELECT TO authenticated USING (driver_id = public.my_driver_id());
DROP POLICY IF EXISTS "driver_update_own_trips" ON public.bookings;
CREATE POLICY "driver_update_own_trips" ON public.bookings
  FOR UPDATE TO authenticated USING (driver_id = public.my_driver_id()) WITH CHECK (driver_id = public.my_driver_id());

DROP POLICY IF EXISTS "driver_read_own_handovers" ON public.cash_handovers_v2;
CREATE POLICY "driver_read_own_handovers" ON public.cash_handovers_v2
  FOR SELECT TO authenticated USING (driver_id = public.my_driver_id());
DROP POLICY IF EXISTS "driver_insert_own_handover" ON public.cash_handovers_v2;
CREATE POLICY "driver_insert_own_handover" ON public.cash_handovers_v2
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.my_driver_id()
              AND org_id = (SELECT org_id FROM public.drivers WHERE id = public.my_driver_id())
              AND coalesce(admin_approved, false) = false);

-- 8. Expenses and cash collections the driver logs during the day (audit #4).
CREATE TABLE IF NOT EXISTS public.driver_cash_entries (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES public.organizations,
  driver_id   bigint NOT NULL REFERENCES public.drivers ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('expense', 'collection')),
  category    text,                       -- expense type, e.g. fuel_petrol, toll
  method      text CHECK (method IN ('cash', 'upi')),   -- collections only
  label       text,                       -- collections: customer name
  amount      numeric(12, 2) NOT NULL CHECK (amount >= 0),
  note        text,
  booking_id  bigint REFERENCES public.bookings ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_cash_entries_driver_day_idx ON public.driver_cash_entries (driver_id, created_at);
ALTER TABLE public.driver_cash_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_admin_all_cash_entries" ON public.driver_cash_entries;
CREATE POLICY "org_admin_all_cash_entries" ON public.driver_cash_entries
  FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
DROP POLICY IF EXISTS "driver_own_cash_entries" ON public.driver_cash_entries;
CREATE POLICY "driver_own_cash_entries" ON public.driver_cash_entries
  FOR ALL TO authenticated
  USING (driver_id = public.my_driver_id())
  WITH CHECK (driver_id = public.my_driver_id()
              AND org_id = (SELECT org_id FROM public.drivers WHERE id = public.my_driver_id()));

COMMIT;

NOTIFY pgrst, 'reload schema';
