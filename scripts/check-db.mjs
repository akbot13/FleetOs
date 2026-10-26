// Checks that the live database matches what the app's migrations expect, using only the
// public key from .env. Run after every database change: `npm run db:check`.
// It reads nothing private and writes nothing: column checks return no rows under the
// access rules, and function checks use inputs the functions reject.
import 'dotenv/config';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const get = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const rpc = async (fn, args) => {
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const missingColumn = (res) => res.body?.code === '42703';
const missingFunction = (res) => res.body?.code === 'PGRST202' || res.status === 404;
const denied = (res) => res.body?.code === '42501';

// What each migration adds that the app depends on.
const columns = {
  bookings: ['notes', 'driver_confirmed_at', 'tracking_token', 'vehicle_class'],
  organizations: ['upi_id', 'upi_qr_url', 'google_review_url'],
  drivers: ['auth_user_id', 'odometer_start_photo', 'odometer_end_photo', 'location_updated_at', 'vehicle_class'],
  org_pricing: ['city_base_fare', 'outstation_per_day'],
  driver_cash_entries: ['kind', 'method', 'label', 'booking_id'],
  drivers_public: ['org_id', 'vehicle_class'],
};
const zero = '00000000-0000-0000-0000-000000000000';
const functions = {
  get_booking_status: { p_token: zero },
  create_customer_booking: { p_org_id: zero, p_booking: {} },       // rejected: unknown org
  driver_sign_in: { p_org_id: zero, p_phone: '', p_pin: '' },        // rejected: no session
  register_driver: { p_org_id: zero, p_phone: '', p_name: '' },      // rejected: bad input
  quote_fare: { p_org_id: zero, p_booking: {} },                    // rejected: unknown trip type
};

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

for (const [table, cols] of Object.entries(columns)) {
  const res = await get(`${encodeURIComponent(table)}?select=${cols.join(',')}&limit=0`);
  check(`${table}: ${cols.join(', ')}`, !missingColumn(res) && res.status < 500, missingColumn(res) ? res.body.message : '');
}
for (const [fn, args] of Object.entries(functions)) {
  const res = await rpc(fn, args);
  check(`function ${fn}`, !missingFunction(res), missingFunction(res) ? 'missing' : '');
}
// Things the public key must not reach.
for (const table of ['bookings table', 'Drivers', 'driver_pins']) {
  const res = await get(`${encodeURIComponent(table)}?select=*&limit=1`);
  check(`${table} closed to the public`, denied(res) || res.status === 404, `HTTP ${res.status}`);
}
for (const table of ['drivers', 'bookings', 'cash_handovers_v2', 'driver_cash_entries']) {
  const res = await get(`${table}?select=id&limit=1`);
  const ok = Array.isArray(res.body) && res.body.length === 0;
  check(`${table} returns no rows to the public`, ok, ok ? '' : JSON.stringify(res.body).slice(0, 80));
}
const secret = await get('organizations?select=whatsapp_api_key&limit=1');
check('organization secrets hidden', denied(secret), `HTTP ${secret.status}`);

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `  (${r.detail})`}`);
}
console.log(failed ? `\n${failed} check(s) failed: a migration is probably missing on the live database.` : '\nDatabase matches the migrations.');
process.exit(failed ? 1 : 0);
