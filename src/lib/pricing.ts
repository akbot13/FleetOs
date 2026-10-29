// Rate cards: how a fleet prices each kind of trip, and the fare calculator that reads them.
//
// The database has the same calculator (quote_fare_from_card in
// supabase/migrations/20261030000000_rate_cards.sql) and always has the final say on what a
// customer pays. This copy lets the Pricing screen preview a fare for rates that aren't saved
// yet. Both are checked against the same cases in src/lib/pricingCases.json.

export type TripType = 'city' | 'airport' | 'sightseeing' | 'outstation';
export type VehicleClass = '4_seater' | '6_seater';

export const tripTypes: TripType[] = ['city', 'airport', 'sightseeing', 'outstation'];
export const vehicleClasses: VehicleClass[] = ['4_seater', '6_seater'];

export interface RentalPackage {
  hours: number;
  km: number;
  price: number;
}

// One pricing model per trip type. Every amount is in rupees.
export type FarePlan =
  // One price per trip.
  | { model: 'flat'; amount: number }
  // A base fare that covers the first included_km, then a rate per km.
  | { model: 'distance'; base: number; included_km: number; per_km: number; minimum: number }
  // Like a taxi meter: base fare plus a rate per km and per minute.
  | { model: 'meter'; base: number; per_km: number; per_minute: number; minimum: number }
  // A rate per hour, never less than min_hours.
  | { model: 'hourly'; per_hour: number; min_hours: number }
  // Rental packages such as 4 hr / 40 km. The cheapest package that covers the trip applies;
  // a trip longer than every package pays the largest one plus extra hours and km.
  | { model: 'package'; packages: RentalPackage[]; extra_per_hour: number; extra_per_km: number }
  // A rate per day of the trip.
  | { model: 'per_day'; per_day: number }
  // Outstation by distance: a rate per km, never fewer than min_km_per_day for each day, plus
  // the driver's daily allowance.
  | { model: 'outstation_km'; per_km: number; min_km_per_day: number; driver_allowance_per_day: number };

export type FareModel = FarePlan['model'];

export interface Surcharge {
  label: string;
  pct: number;
  // Hours of the day in India time, 0-23. A window that ends before it starts runs past midnight.
  from_hour: number;
  to_hour: number;
  // Days of the week, 0 = Sunday. Empty means every day.
  days?: number[];
}

export interface SpecialDate {
  label: string;
  // YYYY-MM-DD, India time.
  date: string;
  pct: number;
}

export interface RateCard {
  version: 1;
  plans: Record<TripType, FarePlan>;
  // Every fare is multiplied by the car size the customer picks.
  vehicle_multipliers: Record<VehicleClass, number>;
  // City and airport fares are multiplied by this when the booking includes the return journey.
  return_multiplier: number;
  // Per night the driver stays out on a multi-day trip.
  night_halt_per_night: number;
  // Time windows such as night or peak hours. Only the highest surcharge that applies is added.
  surcharges: Surcharge[];
  special_dates: SpecialDate[];
  // Charged on the final fare, after the free minutes of waiting.
  waiting_free_minutes: number;
  waiting_per_minute: number;
  // GST or other tax on the whole fare. 0 for none.
  tax_pct: number;
  // Fares are rounded to the nearest multiple of this: 1, 5 or 10.
  round_to: number;
}

export interface TripRequest {
  trip_type: TripType;
  vehicle_class?: VehicleClass | null;
  // ISO time of the pickup. Decides time and date surcharges.
  scheduled_at?: string | null;
  // Road distance of the whole trip in km, including the return for a round trip.
  distance_km?: number | null;
  duration_minutes?: number | null;
  hours?: number | null;
  days?: number | null;
  driver_stay_required?: boolean | null;
  return_trip?: boolean | null;
  // Only known once the trip is over.
  waiting_minutes?: number | null;
}

export interface FareLine {
  label: string;
  amount: number;
}

export interface FareQuote {
  total: number;
  lines: FareLine[];
  // The plan needs a distance or duration the request didn't have, so it was counted as 0.
  missing: ('distance' | 'duration')[];
}

// The old pricing columns on org_pricing, before rate cards.
export interface LegacyPricing {
  city_base_fare?: number | null;
  airport_flat_fare?: number | null;
  sightseeing_per_hour?: number | null;
  outstation_per_day?: number | null;
  driver_stay_per_night?: number | null;
  night_surcharge_pct?: number | null;
  sedan_multiplier?: number | null;
  suv_multiplier?: number | null;
}

// The rate card that charges exactly what quote_fare() charged before rate cards, using the
// fleet's saved rates and the same defaults.
export function rateCardFromLegacy(p: LegacyPricing | null | undefined): RateCard {
  return {
    version: 1,
    plans: {
      city: { model: 'flat', amount: p?.city_base_fare ?? 180 },
      airport: { model: 'flat', amount: p?.airport_flat_fare ?? 450 },
      // With no hourly rate saved, quote_fare() charged a flat 2,200 whatever the hours.
      sightseeing: p?.sightseeing_per_hour != null
        ? { model: 'hourly', per_hour: p.sightseeing_per_hour, min_hours: 1 }
        : { model: 'flat', amount: 2200 },
      outstation: { model: 'per_day', per_day: p?.outstation_per_day ?? 3200 },
    },
    vehicle_multipliers: {
      '4_seater': p?.sedan_multiplier ?? 1,
      '6_seater': p?.suv_multiplier ?? 1.3,
    },
    return_multiplier: 2,
    night_halt_per_night: p?.driver_stay_per_night ?? 0,
    surcharges: (p?.night_surcharge_pct ?? 0) > 0
      ? [{ label: 'Night', pct: p!.night_surcharge_pct!, from_hour: 22, to_hour: 6 }]
      : [],
    special_dates: [],
    waiting_free_minutes: 0,
    waiting_per_minute: 0,
    tax_pct: 0,
    round_to: 1,
  };
}

// A sensible starting plan when an admin switches a trip type to a new model.
export function defaultPlan(model: FareModel): FarePlan {
  switch (model) {
    case 'flat': return { model, amount: 500 };
    case 'distance': return { model, base: 100, included_km: 3, per_km: 14, minimum: 150 };
    case 'meter': return { model, base: 60, per_km: 12, per_minute: 1.5, minimum: 120 };
    case 'hourly': return { model, per_hour: 550, min_hours: 2 };
    case 'package': return {
      model,
      packages: [{ hours: 4, km: 40, price: 1200 }, { hours: 8, km: 80, price: 2200 }, { hours: 12, km: 120, price: 3200 }],
      extra_per_hour: 200,
      extra_per_km: 14,
    };
    case 'per_day': return { model, per_day: 3200 };
    case 'outstation_km': return { model, per_km: 12, min_km_per_day: 250, driver_allowance_per_day: 400 };
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const money = (n: number) => Math.round(n * 100) / 100;

// Hour, weekday and date of a moment in India time (UTC+5:30, no daylight saving).
export function indiaTime(iso: string | null | undefined) {
  const at = iso ? new Date(iso) : new Date();
  const ist = new Date(at.getTime() + 330 * 60 * 1000);
  return { hour: ist.getUTCHours(), weekday: ist.getUTCDay(), date: ist.toISOString().slice(0, 10) };
}

function inWindow(hour: number, from: number, to: number) {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

// The trip's hours, days, distance and duration, with the same limits the database uses.
function tripMeasures(trip: TripRequest) {
  return {
    hours: clamp(trip.hours ?? 4, 1, 24),
    days: Math.round(clamp(trip.days ?? 1, 1, 30)),
    km: trip.distance_km != null && trip.distance_km >= 0 ? trip.distance_km : null,
    minutes: trip.duration_minutes != null && trip.duration_minutes >= 0 ? trip.duration_minutes : null,
  };
}

function planFare(plan: FarePlan, trip: TripRequest, lines: FareLine[], missing: Set<'distance' | 'duration'>) {
  const { hours, days, km: rawKm, minutes: rawMinutes } = tripMeasures(trip);
  const needsKm = plan.model === 'distance' || plan.model === 'meter' || plan.model === 'outstation_km';
  if (needsKm && rawKm == null) missing.add('distance');
  if (plan.model === 'meter' && rawMinutes == null) missing.add('duration');
  const km = rawKm ?? 0;
  const minutes = rawMinutes ?? 0;

  switch (plan.model) {
    case 'flat':
      lines.push({ label: 'Fare', amount: plan.amount });
      return plan.amount;

    case 'distance': {
      const extraKm = Math.max(0, km - plan.included_km);
      lines.push({ label: `Base fare (first ${plan.included_km} km)`, amount: plan.base });
      if (extraKm > 0) lines.push({ label: `${money(extraKm)} km × ₹${plan.per_km}`, amount: money(extraKm * plan.per_km) });
      return topUpToMinimum(plan.base + extraKm * plan.per_km, plan.minimum, lines);
    }

    case 'meter':
      lines.push({ label: 'Base fare', amount: plan.base });
      if (km > 0) lines.push({ label: `${money(km)} km × ₹${plan.per_km}`, amount: money(km * plan.per_km) });
      if (minutes > 0) lines.push({ label: `${Math.round(minutes)} min × ₹${plan.per_minute}`, amount: money(minutes * plan.per_minute) });
      return topUpToMinimum(plan.base + km * plan.per_km + minutes * plan.per_minute, plan.minimum, lines);

    case 'hourly': {
      const billed = Math.max(hours, plan.min_hours);
      lines.push({ label: `${billed} hr × ₹${plan.per_hour}`, amount: money(billed * plan.per_hour) });
      return billed * plan.per_hour;
    }

    case 'package': {
      const packages = [...plan.packages].filter(p => p.hours > 0 && p.price >= 0).sort((a, b) => a.hours - b.hours || a.km - b.km);
      if (packages.length === 0) throw new Error('This rental plan has no packages');
      const fits = packages.filter(p => p.hours >= hours && p.km >= km).sort((a, b) => a.price - b.price)[0];
      if (fits) {
        lines.push({ label: `${fits.hours} hr / ${fits.km} km package`, amount: fits.price });
        return fits.price;
      }
      const largest = packages.reduce((a, b) => (b.hours > a.hours || (b.hours === a.hours && b.km > a.km) ? b : a));
      const extraHours = Math.max(0, hours - largest.hours);
      const extraKm = Math.max(0, km - largest.km);
      lines.push({ label: `${largest.hours} hr / ${largest.km} km package`, amount: largest.price });
      if (extraHours > 0) lines.push({ label: `${money(extraHours)} extra hr × ₹${plan.extra_per_hour}`, amount: money(extraHours * plan.extra_per_hour) });
      if (extraKm > 0) lines.push({ label: `${money(extraKm)} extra km × ₹${plan.extra_per_km}`, amount: money(extraKm * plan.extra_per_km) });
      return largest.price + extraHours * plan.extra_per_hour + extraKm * plan.extra_per_km;
    }

    case 'per_day':
      lines.push({ label: `${days} day${days > 1 ? 's' : ''} × ₹${plan.per_day}`, amount: money(days * plan.per_day) });
      return days * plan.per_day;

    case 'outstation_km': {
      const minimumKm = plan.min_km_per_day * days;
      const billedKm = Math.max(km, minimumKm);
      lines.push({
        label: billedKm > km
          ? `${money(billedKm)} km minimum (${plan.min_km_per_day} km/day) × ₹${plan.per_km}`
          : `${money(billedKm)} km × ₹${plan.per_km}`,
        amount: money(billedKm * plan.per_km),
      });
      if (plan.driver_allowance_per_day > 0) {
        lines.push({ label: `Driver allowance, ${days} day${days > 1 ? 's' : ''}`, amount: money(days * plan.driver_allowance_per_day) });
      }
      return billedKm * plan.per_km + days * plan.driver_allowance_per_day;
    }
  }
}

function topUpToMinimum(fare: number, minimum: number, lines: FareLine[]) {
  if (fare >= minimum) return fare;
  lines.push({ label: `Minimum fare top-up`, amount: money(minimum - fare) });
  return minimum;
}

// The fare for a trip under a rate card, with a line for every part of it.
export function quoteFare(card: RateCard, trip: TripRequest): FareQuote {
  const plan = card.plans[trip.trip_type];
  if (!plan) throw new Error('Unknown trip type');
  const lines: FareLine[] = [];
  const missing = new Set<'distance' | 'duration'>();
  let fare = planFare(plan, trip, lines, missing);

  // The halt sits before the car-size multiplier, as it did in quote_fare() before rate cards.
  const { days } = tripMeasures(trip);
  if (trip.trip_type === 'outstation' && trip.driver_stay_required && days > 1 && card.night_halt_per_night > 0) {
    lines.push({ label: `Driver night halt, ${days - 1} night${days > 2 ? 's' : ''}`, amount: money((days - 1) * card.night_halt_per_night) });
    fare += (days - 1) * card.night_halt_per_night;
  }

  const vehicle = trip.vehicle_class ?? '4_seater';
  const multiplier = card.vehicle_multipliers[vehicle] ?? 1;
  if (multiplier !== 1) {
    lines.push({ label: `${vehicle === '6_seater' ? '6-seater' : '4-seater'} × ${multiplier}`, amount: money(fare * (multiplier - 1)) });
    fare *= multiplier;
  }

  if (trip.return_trip && (trip.trip_type === 'city' || trip.trip_type === 'airport') && card.return_multiplier !== 1) {
    lines.push({ label: `Return journey × ${card.return_multiplier}`, amount: money(fare * (card.return_multiplier - 1)) });
    fare *= card.return_multiplier;
  }

  // Only the biggest time or date surcharge applies, so night and a festival don't stack.
  const when = indiaTime(trip.scheduled_at);
  const applicable = [
    ...card.surcharges
      .filter(s => s.pct > 0 && inWindow(when.hour, s.from_hour, s.to_hour) && (!s.days?.length || s.days.includes(when.weekday)))
      .map(s => ({ label: s.label, pct: s.pct })),
    ...card.special_dates.filter(d => d.pct > 0 && d.date === when.date).map(d => ({ label: d.label, pct: d.pct })),
  ].sort((a, b) => b.pct - a.pct);
  if (applicable.length > 0) {
    const top = applicable[0];
    lines.push({ label: `${top.label} surcharge ${top.pct}%`, amount: money(fare * top.pct / 100) });
    fare *= 1 + top.pct / 100;
  }

  const waiting = Math.max(0, (trip.waiting_minutes ?? 0) - card.waiting_free_minutes);
  if (waiting > 0 && card.waiting_per_minute > 0) {
    lines.push({ label: `Waiting, ${Math.round(waiting)} min × ₹${card.waiting_per_minute}`, amount: money(waiting * card.waiting_per_minute) });
    fare += waiting * card.waiting_per_minute;
  }

  if (card.tax_pct > 0) {
    lines.push({ label: `Tax ${card.tax_pct}%`, amount: money(fare * card.tax_pct / 100) });
    fare *= 1 + card.tax_pct / 100;
  }

  const step = card.round_to > 0 ? card.round_to : 1;
  const total = Math.round(fare / step) * step;
  if (Math.abs(total - fare) >= 0.01) lines.push({ label: 'Rounding', amount: money(total - fare) });

  return { total, lines, missing: [...missing] };
}

// Problems that would make a rate card charge nonsense, in words an admin can act on.
export function rateCardProblems(card: RateCard): string[] {
  const problems: string[] = [];
  const negative = (n: number) => !Number.isFinite(n) || n < 0;
  for (const type of tripTypes) {
    const plan = card.plans[type];
    const values = Object.entries(plan).filter(([k]) => k !== 'model' && k !== 'packages').map(([, v]) => v as number);
    if (values.some(negative)) problems.push(`${tripTypeLabel[type]}: amounts can't be negative or blank.`);
    if (plan.model === 'package') {
      if (plan.packages.length === 0) problems.push(`${tripTypeLabel[type]}: add at least one package.`);
      if (plan.packages.some(p => negative(p.hours) || negative(p.km) || negative(p.price) || p.hours === 0)) {
        problems.push(`${tripTypeLabel[type]}: every package needs hours above 0, and km and price of 0 or more.`);
      }
    }
  }
  for (const c of vehicleClasses) {
    const m = card.vehicle_multipliers[c];
    if (!Number.isFinite(m) || m < 0.5 || m > 5) problems.push('Car-size multipliers must be between 0.5 and 5.');
  }
  if (card.surcharges.some(s => negative(s.pct) || s.pct > 200 || s.from_hour < 0 || s.from_hour > 23 || s.to_hour < 0 || s.to_hour > 23)) {
    problems.push('Surcharges need a percentage from 0 to 200 and hours from 0 to 23.');
  }
  if (card.special_dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || negative(d.pct) || d.pct > 200)) {
    problems.push('Special dates need a date and a percentage from 0 to 200.');
  }
  if ([card.return_multiplier, card.night_halt_per_night, card.waiting_free_minutes, card.waiting_per_minute].some(negative)) {
    problems.push('Return, night halt and waiting amounts must be 0 or more.');
  }
  if (negative(card.tax_pct) || card.tax_pct > 50) problems.push('Tax must be between 0 and 50%.');
  if (![1, 5, 10].includes(card.round_to)) problems.push('Round fares to ₹1, ₹5 or ₹10.');
  return [...new Set(problems)];
}

export const tripTypeLabel: Record<TripType, string> = {
  city: 'City ride',
  airport: 'Airport transfer',
  sightseeing: 'Sightseeing',
  outstation: 'Outstation',
};

export const fareModelLabel: Record<FareModel, string> = {
  flat: 'Flat price',
  distance: 'By distance',
  meter: 'Meter (km + minutes)',
  hourly: 'By the hour',
  package: 'Rental packages',
  per_day: 'Per day',
  outstation_km: 'Per km with daily minimum',
};

export const fareModelHint: Record<FareModel, string> = {
  flat: 'One price for every trip of this type.',
  distance: 'A base fare covers the first few km, then a rate per km. Never below the minimum.',
  meter: 'Base fare plus a rate per km and per minute, like a taxi meter.',
  hourly: 'A rate per hour, with a minimum number of hours.',
  package: 'Fixed packages such as 4 hr / 40 km. Longer trips pay extra per hour and per km.',
  per_day: 'A rate per day of the trip.',
  outstation_km: 'A rate per km, charging at least the daily minimum km, plus a driver allowance per day.',
};
