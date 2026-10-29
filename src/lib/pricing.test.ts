import { describe, it, expect } from 'vitest';
import {
  quoteFare, rateCardFromLegacy, rateCardProblems, defaultPlan, indiaTime,
  type LegacyPricing, type RateCard, type TripRequest, type TripType, type VehicleClass,
} from './pricing';
import fixtures from './pricingCases.json';

// A fixture card is either {legacy: {...}} or a partial card laid over the default one.
function cardFrom(spec: Record<string, unknown>): RateCard {
  if ('legacy' in spec) return rateCardFromLegacy(spec.legacy as LegacyPricing);
  const base = rateCardFromLegacy({});
  const { plans, ...rest } = spec as Partial<RateCard>;
  return { ...base, ...rest, plans: { ...base.plans, ...(plans ?? {}) } } as RateCard;
}

describe('shared fare cases', () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      expect(quoteFare(cardFrom(c.card), c.trip as TripRequest).total).toBe(c.total);
    });
  }
});

// quote_fare() as it was before rate cards (migration 20261026010000), to prove that a fleet
// switched over to a rate card is charged exactly what it was charged before.
function legacyQuote(p: LegacyPricing, trip: TripRequest) {
  const hours = Math.min(Math.max(trip.hours ?? 4, 1), 24);
  const days = Math.min(Math.max(trip.days ?? 1, 1), 30);
  const hour = indiaTime(trip.scheduled_at).hour;
  let fare = {
    city: p.city_base_fare ?? 180,
    airport: p.airport_flat_fare ?? 450,
    sightseeing: p.sightseeing_per_hour != null ? p.sightseeing_per_hour * hours : 2200,
    outstation: (p.outstation_per_day ?? 3200) * days
      + (trip.driver_stay_required ? (p.driver_stay_per_night ?? 0) * (days - 1) : 0),
  }[trip.trip_type];
  fare *= trip.vehicle_class === '6_seater' ? (p.suv_multiplier ?? 1.3) : (p.sedan_multiplier ?? 1);
  if ((trip.trip_type === 'city' || trip.trip_type === 'airport') && trip.return_trip) fare *= 2;
  if ((hour >= 22 || hour < 6) && (p.night_surcharge_pct ?? 0) > 0) fare *= 1 + p.night_surcharge_pct! / 100;
  return Math.round(fare);
}

describe('a rate card built from the old rates charges the same as before', () => {
  const rateSets: LegacyPricing[] = [
    {},
    { sightseeing_per_hour: 550 },
    { city_base_fare: 220, airport_flat_fare: 520, sightseeing_per_hour: 600, outstation_per_day: 2900, driver_stay_per_night: 450, night_surcharge_pct: 15, sedan_multiplier: 1.1, suv_multiplier: 1.45 },
  ];
  const types: TripType[] = ['city', 'airport', 'sightseeing', 'outstation'];
  const sizes: VehicleClass[] = ['4_seater', '6_seater'];
  const times = ['2026-11-02T04:30:00Z', '2026-11-02T17:30:00Z', '2026-11-02T23:59:00Z'];

  it('for every trip type, size, time, return and stay combination', () => {
    let checked = 0;
    for (const p of rateSets) for (const trip_type of types) for (const vehicle_class of sizes) for (const scheduled_at of times)
      for (const return_trip of [false, true]) for (const days of [1, 3]) for (const driver_stay_required of [false, true]) {
        const trip: TripRequest = { trip_type, vehicle_class, scheduled_at, return_trip, days, driver_stay_required, hours: 5 };
        expect(quoteFare(rateCardFromLegacy(p), trip).total, JSON.stringify({ p, trip })).toBe(legacyQuote(p, trip));
        checked++;
      }
    expect(checked).toBe(576);
  });
});

describe('quoteFare', () => {
  it('adds up its lines to the total', () => {
    const card = cardFrom({
      plans: { city: { model: 'meter', base: 60, per_km: 12.5, per_minute: 1.25, minimum: 0 } },
      surcharges: [{ label: 'Night', pct: 20, from_hour: 22, to_hour: 6 }],
      tax_pct: 5,
      round_to: 5,
    });
    const quote = quoteFare(card, { trip_type: 'city', vehicle_class: '6_seater', distance_km: 7.3, duration_minutes: 19, scheduled_at: '2026-11-02T17:30:00Z' });
    const sum = quote.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(sum - quote.total)).toBeLessThan(0.05);
  });

  it('says when the plan needed a distance it did not have', () => {
    const card = cardFrom({ plans: { city: defaultPlan('meter') } });
    expect(quoteFare(card, { trip_type: 'city' }).missing).toEqual(['distance', 'duration']);
    expect(quoteFare(card, { trip_type: 'city', distance_km: 5, duration_minutes: 12 }).missing).toEqual([]);
  });
});

describe('rateCardProblems', () => {
  it('accepts every default plan', () => {
    for (const model of ['flat', 'distance', 'meter', 'hourly', 'package', 'per_day', 'outstation_km'] as const) {
      expect(rateCardProblems(cardFrom({ plans: { city: defaultPlan(model) } }))).toEqual([]);
    }
  });

  it('names what is wrong', () => {
    const card = cardFrom({ plans: { city: { model: 'flat', amount: -5 } }, round_to: 3, tax_pct: 80 });
    expect(rateCardProblems(card)).toEqual([
      "City ride: amounts can't be negative or blank.",
      'Tax must be between 0 and 50%.',
      'Round fares to ₹1, ₹5 or ₹10.',
    ]);
  });
});
