-- set_driver_pin() wrote to "sdpublic.driver_pins", a schema that doesn't exist (typo in
-- 20261025010000_driver_pin_sign_in.sql). PL/pgSQL only resolves table names when the function
-- runs, so the migration applied cleanly but every attempt to set a PIN failed, and on a fresh
-- database no driver could ever sign in.
--
-- NOT APPLIED to the live database. The live function was presumably corrected by hand, since
-- PIN sign-in works there; this file makes the migrations match so a new fleet's database works.
-- Same function as before, with public.driver_pins. Safe to re-run.

BEGIN;

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
  INSERT INTO public.driver_pins AS p (driver_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_driver_id, crypt(p_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (driver_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
  UPDATE public.drivers SET auth_user_id = NULL WHERE id = p_driver_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_driver_pin(bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_driver_pin(bigint, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
