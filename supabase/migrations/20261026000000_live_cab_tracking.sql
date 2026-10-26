-- Customers can see their cab on a map while the trip is open.
--
-- 1. drivers.location_updated_at records when the driver app last moved the pin, so the
--    customer screen can say "updated 2 min ago" or warn that the position has gone stale.
--    A trigger stamps it; drivers cannot set it themselves.
-- 2. get_booking_status() also returns the assigned driver's position, but only while the
--    trip is live. Once a booking is pending, completed or cancelled the position is NULL,
--    so a customer holding an old tracking link cannot follow the driver afterwards.
--
-- Safe to re-run. No rows are changed.

BEGIN;

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.stamp_driver_location()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.location_lat IS DISTINCT FROM OLD.location_lat
     OR NEW.location_lng IS DISTINCT FROM OLD.location_lng THEN
    NEW.location_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;
-- Named to sort after limit_driver_row_update: BEFORE triggers fire in name order.
DROP TRIGGER IF EXISTS stamp_driver_location ON public.drivers;
CREATE TRIGGER stamp_driver_location BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.stamp_driver_location();

-- Same function as 20261025040000, with location_updated_at added to the columns a driver's
-- update may touch (the stamp trigger changes it on the driver's behalf).
CREATE OR REPLACE FUNCTION public.limit_driver_row_update()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY['status', 'location_lat', 'location_lng', 'location_updated_at',
                          'odometer_start_photo', 'odometer_end_photo'];
BEGIN
  IF current_user <> 'authenticated' OR public.is_org_admin(OLD.org_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Drivers can only change their duty status, location and odometer photos'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status = 'pending_approval' OR NEW.status NOT IN ('free', 'offline', 'on-trip')) THEN
    RAISE EXCEPTION 'Only the fleet admin can approve a driver' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS limit_driver_row_update ON public.drivers;
CREATE TRIGGER limit_driver_row_update BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.limit_driver_row_update();

-- The return type changes, so the old function has to be dropped first.
DROP FUNCTION IF EXISTS public.get_booking_status(uuid);
CREATE FUNCTION public.get_booking_status(p_token uuid)
RETURNS TABLE (id bigint, status text, scheduled_at timestamptz, pickup text, "drop" text,
               driver_name text, driver_phone text, vehicle_model text, plate_number text,
               driver_lat double precision, driver_lng double precision,
               driver_location_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id, b.status::text, b.scheduled_at, b.pickup, b."drop",
         d.name, d.phone, d.vehicle_model, d.plate_number,
         CASE WHEN live.ok THEN d.location_lat END,
         CASE WHEN live.ok THEN d.location_lng END,
         CASE WHEN live.ok THEN d.location_updated_at END
    FROM public.bookings b
    LEFT JOIN public.drivers d ON d.id = b.driver_id
    CROSS JOIN LATERAL (
      SELECT d.id IS NOT NULL AND b.status::text NOT IN ('completed', 'cancelled', 'pending') AS ok
    ) live
   WHERE b.tracking_token = p_token;
$$;
REVOKE ALL ON FUNCTION public.get_booking_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_booking_status(uuid) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
