// Tests the rate-card SQL in an in-memory Postgres (PGlite), with no connection to any real
// database. Run with: npm run test:sql
//
// 1. Every case in src/lib/pricingCases.json gives the same total from quote_fare_from_card()
//    as from quoteFare() in src/lib/pricing.ts.
// 2. For fleets without a rate card, the new quote_fare() charges exactly what the previous
//    quote_fare() (migration 20261026010000) charged, across every trip type, car size, time,
//    return, day count and stay combination.

import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const db = new PGlite();

// Just enough of the real schema for the pricing functions.
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE TABLE public.org_pricing (
    id serial PRIMARY KEY, org_id uuid UNIQUE NOT NULL,
    city_base_fare numeric, outstation_per_day numeric, city_per_km numeric, outstation_per_km numeric,
    airport_flat_fare numeric, sightseeing_per_hour numeric, sedan_multiplier numeric, suv_multiplier numeric,
    night_surcharge_pct numeric, driver_stay_per_night numeric, waiting_per_hour numeric, updated_at timestamptz
  );
  CREATE FUNCTION public.is_org_admin(uuid) RETURNS boolean LANGUAGE sql AS 'SELECT false';
`);

// The previous quote_fare(), kept under another name to compare against.
const previous = read('supabase/migrations/20261026010000_vehicle_class_pricing.sql');
const previousQuote = previous.slice(
  previous.indexOf('CREATE OR REPLACE FUNCTION public.quote_fare('),
  previous.indexOf('REVOKE ALL ON FUNCTION public.quote_fare('),
).replace('public.quote_fare(', 'public.quote_fare_previous(');
await db.exec(previousQuote);

await db.exec(read('supabase/migrations/20261030000000_rate_cards.sql').replace(/NOTIFY pgrst[^;]*;/, ''));

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL', msg); };

const legacyColumns = ['city_base_fare', 'airport_flat_fare', 'sightseeing_per_hour', 'outstation_per_day',
  'driver_stay_per_night', 'night_surcharge_pct', 'sedan_multiplier', 'suv_multiplier'];
let orgCount = 0;
async function orgWithRates(rates) {
  const org = `00000000-0000-0000-0000-${String(++orgCount).padStart(12, '0')}`;
  await db.query(
    `INSERT INTO org_pricing (org_id, ${legacyColumns.join(', ')}) VALUES ($1, ${legacyColumns.map((_, i) => `$${i + 2}`).join(', ')})`,
    [org, ...legacyColumns.map(c => rates[c] ?? null)],
  );
  return org;
}
async function legacyCard(rates) {
  const org = await orgWithRates(rates);
  const { rows } = await db.query('SELECT rate_card_from_legacy(p) AS card FROM org_pricing p WHERE org_id = $1', [org]);
  return rows[0].card;
}

// 1. Shared cases.
const { cases } = JSON.parse(read('src/lib/pricingCases.json'));
const defaultCard = await legacyCard({});
for (const c of cases) {
  let card;
  if (c.card.legacy) card = await legacyCard(c.card.legacy);
  else {
    const { plans, ...rest } = c.card;
    card = { ...defaultCard, ...rest, plans: { ...defaultCard.plans, ...(plans ?? {}) } };
  }
  const { rows } = await db.query('SELECT quote_fare_from_card($1::jsonb, $2::jsonb) AS total', [card, c.trip]);
  const total = Number(rows[0].total);
  if (total !== c.total) fail(`${c.name}: SQL gave ${total}, expected ${c.total}`);
}
console.log(`shared cases: ${cases.length} checked`);

// 2. Same fares as the previous quote_fare() for fleets without a rate card.
const rateSets = [
  {},
  { sightseeing_per_hour: 550 },
  { city_base_fare: 220, airport_flat_fare: 520, sightseeing_per_hour: 600, outstation_per_day: 2900, driver_stay_per_night: 450, night_surcharge_pct: 15, sedan_multiplier: 1.1, suv_multiplier: 1.45 },
];
let compared = 0;
for (const rates of rateSets) {
  const org = await orgWithRates(rates);
  for (const trip_type of ['city', 'airport', 'sightseeing', 'outstation'])
    for (const vehicle_class of ['4_seater', '6_seater'])
      for (const scheduled_at of ['2026-11-02T04:30:00Z', '2026-11-02T17:30:00Z', '2026-11-02T23:59:00Z'])
        for (const return_date of [null, '2026-11-03T04:30:00Z'])
          for (const number_of_days of [1, 3])
            for (const driver_stay_required of [false, true])
              for (const estimated_hours of [null, 6]) {
                const booking = { trip_type, vehicle_class, scheduled_at, return_date, number_of_days, driver_stay_required, estimated_hours };
                const { rows } = await db.query(
                  'SELECT quote_fare($1, $2::jsonb) AS now, quote_fare_previous($1, $2::jsonb) AS before', [org, booking]);
                compared++;
                if (Number(rows[0].now) !== Number(rows[0].before)) {
                  fail(`${JSON.stringify({ rates, booking })}: now ${rows[0].now}, before ${rows[0].before}`);
                }
              }
}
console.log(`same as previous quote_fare: ${compared} combinations checked`);

// A customer's distance is ignored; it can't be used to lower the fare.
{
  const org = await orgWithRates({});
  await db.query(`UPDATE org_pricing SET rate_card = jsonb_set(rate_card_from_legacy(org_pricing), '{plans,city}',
    '{"model":"distance","base":100,"included_km":3,"per_km":14,"minimum":150}') WHERE org_id = $1`, [org]);
  const { rows } = await db.query(`SELECT quote_fare($1, '{"trip_type":"city","distance_km":40,"scheduled_at":"2026-11-02T04:30:00Z"}') AS f`, [org]);
  if (Number(rows[0].f) !== 150) fail(`customer distance should be ignored, got ${rows[0].f}`);
  console.log('customer distance ignored: checked');
}

await db.close();
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all rate-card SQL checks passed');
