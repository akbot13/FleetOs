-- Fares by car size, from a rate card the admin can edit.
--
-- * org_pricing gets the two base fares that were hard-coded in quote_fare()
--   (city base fare, outstation per day).
-- * bookings and drivers get vehicle_class: '4_seater' (sedan) or '6_seater' (SUV).
-- * quote_fare() reads every base fare from the rate card (old numbers stay as fallbacks)
--   and multiplies by the car-size multiplier before any return-trip doubling or night surcharge.
-- * create_customer_booking() stores the requested car size.
-- Drivers cannot change vehicle_class: it is not in the columns the driver triggers allow.
--
-- Safe to re-run. Existing rows get '4_seater'.

BEGIN;

ALTER TABLE public.org_pricing
  ADD COLUMN IF NOT EXISTS city_base_fare numeric,
  ADD COLUMN IF NOT EXISTS outstation_per_day numeric;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS vehicle_class text NOT NULL DEFAULT '4_seater';
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_vehicle_class_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_vehicle_class_check
  CHECK (vehicle_class IN ('4_seater', '6_seater'));

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS vehicle_class text NOT NULL DEFAULT '4_seater';
ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_vehicle_class_check;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_vehicle_class_check
  CHECK (vehicle_class IN ('4_seater', '6_seater'));

-- Public columns only, as before, plus the car size.
DROP VIEW IF EXISTS public.drivers_public;
CREATE VIEW public.drivers_public AS
  SELECT id, org_id, name, vehicle_model, status, vehicle_class
    FROM public.drivers
   WHERE status IN ('free', 'on-trip', 'offline');
GRANT SELECT ON public.drivers_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.quote_fare(p_org_id uuid, p_booking jsonb)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.org_pricing%ROWTYPE;
  v_type text := p_booking->>'trip_type';
  v_class text := nullif(p_booking->>'vehicle_class', '');
  v_hours numeric := least(greatest(coalesce((p_booking->>'estimated_hours')::numeric, 4), 1), 24);
  v_days int := least(greatest(coalesce((p_booking->>'number_of_days')::int, 1), 1), 30);
  v_at timestamptz := coalesce((p_booking->>'scheduled_at')::timestamptz, now());
  v_hour int := extract(hour FROM v_at AT TIME ZONE 'Asia/Kolkata');
  v_fare numeric;
BEGIN
  IF v_class IS NOT NULL AND v_class NOT IN ('4_seater', '6_seater') THEN
    RAISE EXCEPTION 'Unknown car size';
  END IF;

  SELECT * INTO p FROM public.org_pricing WHERE org_id = p_org_id;

  v_fare := CASE v_type
    WHEN 'city' THEN coalesce(p.city_base_fare, 180)
    WHEN 'airport' THEN coalesce(p.airport_flat_fare, 450)
    WHEN 'sightseeing' THEN coalesce(p.sightseeing_per_hour * v_hours, 2200)
    WHEN 'outstation' THEN coalesce(p.outstation_per_day, 3200) * v_days
      + CASE WHEN (p_booking->>'driver_stay_required')::boolean
             THEN coalesce(p.driver_stay_per_night, 0) * (v_days - 1) ELSE 0 END
    ELSE NULL
  END;
  IF v_fare IS NULL THEN
    RAISE EXCEPTION 'Unknown trip type';
  END IF;

  -- Car size: the 4-seater multiplier defaults to 1, the 6-seater to 1.3.
  IF v_class = '6_seater' THEN
    v_fare := v_fare * coalesce(p.suv_multiplier, 1.3);
  ELSE
    v_fare := v_fare * coalesce(p.sedan_multiplier, 1.0);
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
                                    return_date, number_of_days, driver_stay_required, status,
                                    vehicle_class)
  VALUES (p_org_id, left(r.customer_name, 120), left(r.customer_phone, 20), left(r.pickup, 300), left(r."drop", 300),
          coalesce(r.scheduled_at, now()), r.trip_type, public.quote_fare(p_org_id, p_booking),
          CASE WHEN r.payment_method IN ('cash', 'upi') THEN r.payment_method ELSE 'cash' END,
          left(r.notes, 1000), r.stops, r.estimated_hours, r.return_date, r.number_of_days,
          r.driver_stay_required, 'pending',
          CASE WHEN r.vehicle_class IN ('4_seater', '6_seater') THEN r.vehicle_class ELSE '4_seater' END)
  RETURNING b.id, b.tracking_token INTO v_id, v_token;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.create_customer_booking(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_customer_booking(uuid, jsonb) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
