-- Fares are computed by the database, never taken from the customer's browser (review B1),
-- and drivers can change only the columns their app needs (review B2, B3).
--
-- Safe to re-run. No rows are changed.

BEGIN;

-- 1. The fare for a booking request, from the org's rate card in org_pricing.
--    Bookings carry no distance yet, so per-km rates are not used; the base fares below
--    are the ones the customer app showed before this change.
CREATE OR REPLACE FUNCTION public.quote_fare(p_org_id uuid, p_booking jsonb)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.org_pricing%ROWTYPE;
  v_type text := p_booking->>'trip_type';
  v_hours numeric := least(greatest(coalesce((p_booking->>'estimated_hours')::numeric, 4), 1), 24);
  v_days int := least(greatest(coalesce((p_booking->>'number_of_days')::int, 1), 1), 30);
  v_at timestamptz := coalesce((p_booking->>'scheduled_at')::timestamptz, now());
  v_hour int := extract(hour FROM v_at AT TIME ZONE 'Asia/Kolkata');
  v_fare numeric;
BEGIN
  SELECT * INTO p FROM public.org_pricing WHERE org_id = p_org_id;

  v_fare := CASE v_type
    WHEN 'city' THEN 180
    WHEN 'airport' THEN coalesce(p.airport_flat_fare, 450)
    WHEN 'sightseeing' THEN coalesce(p.sightseeing_per_hour * v_hours, 2200)
    WHEN 'outstation' THEN 3200 * v_days
      + CASE WHEN (p_booking->>'driver_stay_required')::boolean
             THEN coalesce(p.driver_stay_per_night, 0) * (v_days - 1) ELSE 0 END
    ELSE NULL
  END;
  IF v_fare IS NULL THEN
    RAISE EXCEPTION 'Unknown trip type';
  END IF;

  -- A return journey on the same booking doubles a one-way city or airport fare.
  IF v_type IN ('city', 'airport') AND nullif(p_booking->>'return_date', '') IS NOT NULL THEN
    v_fare := v_fare * 2;
  END IF;

  -- Night surcharge for pickups from 22:00 to 05:59 India time.
  IF (v_hour >= 22 OR v_hour < 6) AND coalesce(p.night_surcharge_pct, 0) > 0 THEN
    v_fare := v_fare * (1 + p.night_surcharge_pct / 100);
  END IF;

  RETURN round(v_fare);
END;
$$;
REVOKE ALL ON FUNCTION public.quote_fare(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.quote_fare(uuid, jsonb) TO anon, authenticated;

-- 2. Customer bookings take their fare from quote_fare(); any fare in the request is ignored.
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

  -- Fare, status, driver, payment progress and timestamps are never taken from the customer.
  INSERT INTO public.bookings AS b (org_id, customer_name, customer_phone, pickup, "drop", scheduled_at,
                                    trip_type, fare, payment_method, notes, stops, estimated_hours,
                                    return_date, number_of_days, driver_stay_required, status)
  VALUES (p_org_id, left(r.customer_name, 120), left(r.customer_phone, 20), left(r.pickup, 300), left(r."drop", 300),
          coalesce(r.scheduled_at, now()), r.trip_type, public.quote_fare(p_org_id, p_booking),
          CASE WHEN r.payment_method IN ('cash', 'upi') THEN r.payment_method ELSE 'cash' END,
          left(r.notes, 1000), r.stops, r.estimated_hours, r.return_date, r.number_of_days,
          r.driver_stay_required, 'pending')
  RETURNING b.id, b.tracking_token INTO v_id, v_token;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_booking(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_customer_booking(uuid, jsonb) TO anon, authenticated;

-- 3. Drivers may update their own row and their own trips (policies in 20261025010000), but
--    only these columns. Admins and server functions are not limited: the checks apply only
--    when a signed-in app user who is not the org's admin makes the change.
CREATE OR REPLACE FUNCTION public.limit_driver_row_update()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY['status', 'location_lat', 'location_lng', 'odometer_start_photo', 'odometer_end_photo'];
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

CREATE OR REPLACE FUNCTION public.limit_driver_trip_update()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY['status', 'driver_confirmed_at', 'trip_started_at', 'trip_completed_at',
                          'amount_collected', 'payment_method', 'payment_confirmed_at',
                          'odometer_start_reading', 'odometer_start_url', 'odometer_start_at',
                          'odometer_end_reading', 'odometer_end_url', 'odometer_end_at'];
BEGIN
  IF current_user <> 'authenticated' OR public.is_org_admin(OLD.org_id) THEN
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'Drivers cannot change the fare, customer or route of a trip' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status IN ('completed', 'cancelled') OR NEW.status NOT IN ('confirmed', 'in-progress', 'completed')) THEN
    RAISE EXCEPTION 'Drivers can only confirm, start or complete an open trip' USING ERRCODE = '42501';
  END IF;
  IF (NEW.amount_collected IS DISTINCT FROM OLD.amount_collected AND NEW.amount_collected < 0)
     OR (NEW.payment_method IS DISTINCT FROM OLD.payment_method AND NEW.payment_method NOT IN ('cash', 'upi')) THEN
    RAISE EXCEPTION 'Collected amount must be zero or more, paid by cash or UPI' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS limit_driver_trip_update ON public.bookings;
CREATE TRIGGER limit_driver_trip_update BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.limit_driver_trip_update();

COMMIT;
