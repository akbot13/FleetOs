-- Rate cards: each fleet picks how every trip type is priced.
--
-- NOT APPLIED to the live database. Written on the Ak-changes branch and tested offline in an
-- in-memory Postgres (PGlite) against src/lib/pricingCases.json. Review before applying.
--
-- * org_pricing.rate_card holds the fleet's rate card (shape: RateCard in src/lib/pricing.ts).
--   Models per trip type: flat, distance, meter, hourly, package, per_day, outstation_km; plus
--   car-size multipliers, return multiplier, night halt, time and date surcharges (only the
--   highest applies), waiting charges, tax and rounding.
-- * A fleet with no rate card is priced from its old org_pricing columns exactly as before:
--   rate_card_from_legacy() builds the equivalent card.
-- * quote_fare() and create_customer_booking() keep their signatures, so the apps keep working.
-- * Customers can't choose their own distance: distance and duration in a customer request are
--   ignored until the app sends pickup and drop coordinates the database can measure. Admins
--   can quote with a distance from the Pricing screen.
--
-- Safe to re-run. No rows are changed; org_pricing.rate_card starts empty for every fleet.

BEGIN;

ALTER TABLE public.org_pricing ADD COLUMN IF NOT EXISTS rate_card jsonb;

-- A number from a JSON object, or the default when it's missing, null or not a number.
-- Numbers sent as text ("4") count, as they did in quote_fare() before.
CREATE OR REPLACE FUNCTION public.jnum(p jsonb, p_key text, p_default numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p -> p_key) = 'number' THEN (p ->> p_key)::numeric
    WHEN jsonb_typeof(p -> p_key) = 'string' AND (p ->> p_key) ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN (p ->> p_key)::numeric
    ELSE p_default
  END;
$$;

-- The rate card that charges what quote_fare() charged before rate cards, from the old columns.
CREATE OR REPLACE FUNCTION public.rate_card_from_legacy(p public.org_pricing)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'version', 1,
    'plans', jsonb_build_object(
      'city', jsonb_build_object('model', 'flat', 'amount', coalesce(p.city_base_fare, 180)),
      'airport', jsonb_build_object('model', 'flat', 'amount', coalesce(p.airport_flat_fare, 450)),
      'sightseeing', CASE WHEN p.sightseeing_per_hour IS NOT NULL
        THEN jsonb_build_object('model', 'hourly', 'per_hour', p.sightseeing_per_hour, 'min_hours', 1)
        ELSE jsonb_build_object('model', 'flat', 'amount', 2200) END,
      'outstation', jsonb_build_object('model', 'per_day', 'per_day', coalesce(p.outstation_per_day, 3200))
    ),
    'vehicle_multipliers', jsonb_build_object(
      '4_seater', coalesce(p.sedan_multiplier, 1),
      '6_seater', coalesce(p.suv_multiplier, 1.3)
    ),
    'return_multiplier', 2,
    'night_halt_per_night', coalesce(p.driver_stay_per_night, 0),
    'surcharges', CASE WHEN coalesce(p.night_surcharge_pct, 0) > 0
      THEN jsonb_build_array(jsonb_build_object('label', 'Night', 'pct', p.night_surcharge_pct, 'from_hour', 22, 'to_hour', 6))
      ELSE '[]'::jsonb END,
    'special_dates', '[]'::jsonb,
    'waiting_free_minutes', 0,
    'waiting_per_minute', 0,
    'tax_pct', 0,
    'round_to', 1
  );
$$;

-- The fare for a trip under a rate card. The same calculation as quoteFare() in
-- src/lib/pricing.ts; both are tested against src/lib/pricingCases.json.
-- p_trip: trip_type, vehicle_class, scheduled_at, distance_km, duration_minutes, hours, days,
-- driver_stay_required, return_trip, waiting_minutes.
CREATE OR REPLACE FUNCTION public.quote_fare_from_card(p_card jsonb, p_trip jsonb)
RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_type text := p_trip ->> 'trip_type';
  v_class text := coalesce(nullif(p_trip ->> 'vehicle_class', ''), '4_seater');
  v_plan jsonb := p_card -> 'plans' -> v_type;
  v_model text := v_plan ->> 'model';
  v_hours numeric := least(greatest(public.jnum(p_trip, 'hours', 4), 1), 24);
  v_days int := round(least(greatest(public.jnum(p_trip, 'days', 1), 1), 30));
  v_km numeric := greatest(public.jnum(p_trip, 'distance_km', 0), 0);
  v_min numeric := greatest(public.jnum(p_trip, 'duration_minutes', 0), 0);
  v_at timestamp := (coalesce(nullif(p_trip ->> 'scheduled_at', '')::timestamptz, now())) AT TIME ZONE 'Asia/Kolkata';
  v_hour int := extract(hour FROM v_at);
  v_dow int := extract(dow FROM v_at);
  v_date text := to_char(v_at, 'YYYY-MM-DD');
  v_fare numeric;
  v_mult numeric;
  v_pct numeric := 0;
  v_wait numeric;
  v_step numeric;
  v_pkg jsonb;
  s jsonb;
BEGIN
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Unknown trip type';
  END IF;
  IF v_class NOT IN ('4_seater', '6_seater') THEN
    RAISE EXCEPTION 'Unknown car size';
  END IF;

  IF v_model = 'flat' THEN
    v_fare := public.jnum(v_plan, 'amount', 0);
  ELSIF v_model = 'distance' THEN
    v_fare := greatest(
      public.jnum(v_plan, 'base', 0) + greatest(v_km - public.jnum(v_plan, 'included_km', 0), 0) * public.jnum(v_plan, 'per_km', 0),
      public.jnum(v_plan, 'minimum', 0));
  ELSIF v_model = 'meter' THEN
    v_fare := greatest(
      public.jnum(v_plan, 'base', 0) + v_km * public.jnum(v_plan, 'per_km', 0) + v_min * public.jnum(v_plan, 'per_minute', 0),
      public.jnum(v_plan, 'minimum', 0));
  ELSIF v_model = 'hourly' THEN
    v_fare := greatest(v_hours, public.jnum(v_plan, 'min_hours', 1)) * public.jnum(v_plan, 'per_hour', 0);
  ELSIF v_model = 'package' THEN
    -- The cheapest package that covers the trip; otherwise the largest plus extra hours and km.
    SELECT pk INTO v_pkg FROM jsonb_array_elements(v_plan -> 'packages') pk
     WHERE public.jnum(pk, 'hours', 0) > 0 AND public.jnum(pk, 'price', -1) >= 0
       AND public.jnum(pk, 'hours', 0) >= v_hours AND public.jnum(pk, 'km', 0) >= v_km
     ORDER BY public.jnum(pk, 'price', 0) LIMIT 1;
    IF v_pkg IS NOT NULL THEN
      v_fare := public.jnum(v_pkg, 'price', 0);
    ELSE
      SELECT pk INTO v_pkg FROM jsonb_array_elements(v_plan -> 'packages') pk
       WHERE public.jnum(pk, 'hours', 0) > 0 AND public.jnum(pk, 'price', -1) >= 0
       ORDER BY public.jnum(pk, 'hours', 0) DESC, public.jnum(pk, 'km', 0) DESC LIMIT 1;
      IF v_pkg IS NULL THEN
        RAISE EXCEPTION 'This rental plan has no packages';
      END IF;
      v_fare := public.jnum(v_pkg, 'price', 0)
        + greatest(v_hours - public.jnum(v_pkg, 'hours', 0), 0) * public.jnum(v_plan, 'extra_per_hour', 0)
        + greatest(v_km - public.jnum(v_pkg, 'km', 0), 0) * public.jnum(v_plan, 'extra_per_km', 0);
    END IF;
  ELSIF v_model = 'per_day' THEN
    v_fare := v_days * public.jnum(v_plan, 'per_day', 0);
  ELSIF v_model = 'outstation_km' THEN
    v_fare := greatest(v_km, public.jnum(v_plan, 'min_km_per_day', 0) * v_days) * public.jnum(v_plan, 'per_km', 0)
      + v_days * public.jnum(v_plan, 'driver_allowance_per_day', 0);
  ELSE
    RAISE EXCEPTION 'Unknown pricing model %', coalesce(v_model, '(none)');
  END IF;

  -- The night halt sits before the car-size multiplier, as it did before rate cards.
  IF v_type = 'outstation' AND coalesce((p_trip ->> 'driver_stay_required')::boolean, false) AND v_days > 1 THEN
    v_fare := v_fare + (v_days - 1) * public.jnum(p_card, 'night_halt_per_night', 0);
  END IF;

  v_mult := public.jnum(p_card -> 'vehicle_multipliers', v_class, 1);
  v_fare := v_fare * v_mult;

  IF v_type IN ('city', 'airport') AND coalesce((p_trip ->> 'return_trip')::boolean, false) THEN
    v_fare := v_fare * public.jnum(p_card, 'return_multiplier', 2);
  END IF;

  -- Only the biggest time or date surcharge applies.
  FOR s IN SELECT x FROM jsonb_array_elements(coalesce(p_card -> 'surcharges', '[]')) x LOOP
    IF public.jnum(s, 'pct', 0) > v_pct
       -- In brackets: PL/pgSQL would otherwise end the IF condition at the CASE's THEN.
       AND (CASE WHEN public.jnum(s, 'from_hour', 0) <= public.jnum(s, 'to_hour', 0)
                 THEN v_hour >= public.jnum(s, 'from_hour', 0) AND v_hour < public.jnum(s, 'to_hour', 0)
                 ELSE v_hour >= public.jnum(s, 'from_hour', 0) OR v_hour < public.jnum(s, 'to_hour', 0) END)
       AND (jsonb_typeof(s -> 'days') IS DISTINCT FROM 'array' OR jsonb_array_length(s -> 'days') = 0
            OR (s -> 'days') @> to_jsonb(v_dow)) THEN
      v_pct := public.jnum(s, 'pct', 0);
    END IF;
  END LOOP;
  FOR s IN SELECT x FROM jsonb_array_elements(coalesce(p_card -> 'special_dates', '[]')) x LOOP
    IF s ->> 'date' = v_date AND public.jnum(s, 'pct', 0) > v_pct THEN
      v_pct := public.jnum(s, 'pct', 0);
    END IF;
  END LOOP;
  v_fare := v_fare * (1 + v_pct / 100);

  v_wait := greatest(public.jnum(p_trip, 'waiting_minutes', 0) - public.jnum(p_card, 'waiting_free_minutes', 0), 0);
  v_fare := v_fare + v_wait * public.jnum(p_card, 'waiting_per_minute', 0);

  v_fare := v_fare * (1 + public.jnum(p_card, 'tax_pct', 0) / 100);

  v_step := public.jnum(p_card, 'round_to', 1);
  IF v_step <= 0 THEN v_step := 1; END IF;
  RETURN round(v_fare / v_step) * v_step;
END;
$$;
REVOKE ALL ON FUNCTION public.quote_fare_from_card(jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.quote_fare_from_card(jsonb, jsonb) TO anon, authenticated;

-- Same signature as before, so the customer and admin apps keep working. The fleet's rate card
-- if it has one, otherwise the card built from its old rates (identical fares to before).
CREATE OR REPLACE FUNCTION public.quote_fare(p_org_id uuid, p_booking jsonb)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  p public.org_pricing%ROWTYPE;
  v_card jsonb;
  v_admin boolean := public.is_org_admin(p_org_id);
BEGIN
  SELECT * INTO p FROM public.org_pricing WHERE org_id = p_org_id;
  v_card := coalesce(p.rate_card, public.rate_card_from_legacy(p));

  RETURN public.quote_fare_from_card(v_card, jsonb_build_object(
    'trip_type', p_booking ->> 'trip_type',
    'vehicle_class', p_booking ->> 'vehicle_class',
    'scheduled_at', p_booking ->> 'scheduled_at',
    'hours', p_booking -> 'estimated_hours',
    'days', p_booking -> 'number_of_days',
    'driver_stay_required', p_booking -> 'driver_stay_required',
    'return_trip', nullif(p_booking ->> 'return_date', '') IS NOT NULL,
    -- A customer could send any distance, so only an admin's is used for now.
    'distance_km', CASE WHEN v_admin THEN p_booking -> 'distance_km' END,
    'duration_minutes', CASE WHEN v_admin THEN p_booking -> 'duration_minutes' END
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.quote_fare(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.quote_fare(uuid, jsonb) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
