/**
 * Playwright Global Setup — seeds Supabase with known test state before the run.
 *
 * What it does:
 *   1. Signs in as admin
 *   2. Wipes any previous playwright-seed bookings from the new `bookings` table
 *   3. Inserts 10 pending bookings under Anil Cabs org
 *   4. Resets all drivers to 'free'
 *   5. Inserts 2 pending-approval test drivers (for approval tests)
 *
 * IMPORTANT: Requires ADMIN_PASSWORD env var (set in .env or CI secrets)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL   = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON  = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Set them in your .env file.');
}
const ADMIN_EMAIL    = 'shivamjindal076@gmail.com';
const ADMIN_PASS     = process.env.ADMIN_PASSWORD || 'your_password_here';
const ANIL_CABS_ORG  = 'a0000000-0000-0000-0000-000000000001';

const ROUTES = [
  { pickup: 'Sindhi Camp',  drop: 'Jaipur Airport',     fare: 450 },
  { pickup: 'MI Road',      drop: 'Hawa Mahal',          fare: 280 },
  { pickup: 'Ajmer Road',   drop: 'Vaishali Nagar',      fare: 320 },
  { pickup: 'Raja Park',    drop: 'Mansarovar',           fare: 190 },
  { pickup: 'Tonk Road',    drop: 'Malviya Nagar',        fare: 260 },
  { pickup: 'Jhotwara',     drop: 'Civil Lines',          fare: 350 },
  { pickup: 'C-Scheme',     drop: 'Jagatpura',            fare: 290 },
  { pickup: 'Sodala',       drop: 'Bais Godam',           fare: 180 },
  { pickup: 'Sanganer',     drop: 'Pink Square',          fare: 420 },
  { pickup: 'Kalwar Road',  drop: 'World Trade Park',     fare: 310 },
];

export default async function globalSetup() {
  const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
  }) as any;

  // ─── Auth ─────────────────────────────────────────────────────────────────
  const { error: signInError } = await db.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });

  if (signInError) {
    console.warn('[setup] Sign-in failed:', signInError.message);
    console.warn('[setup] Tests that need seeded data may be skipped.');
    return;
  }
  console.log('[setup] Signed in as admin.');

  // ─── Wipe previous test bookings ──────────────────────────────────────────
  await db.from('bookings')
    .delete()
    .eq('org_id', ANIL_CABS_ORG)
    .like('customer_name', 'Test Customer%');

  // ─── Seed 10 pending bookings ─────────────────────────────────────────────
  const todayISO = new Date().toISOString();
  const rows = ROUTES.map((r, i) => ({
    org_id:           ANIL_CABS_ORG,
    customer_name:    `Test Customer ${i + 1}`,
    customer_phone:   `+9198765${String(43210 + i).padStart(5, '0')}`,
    pickup:           r.pickup,
    drop:             r.drop,
    fare:             r.fare,
    trip_type:        'city',
    status:           'pending',
    scheduled_at:     todayISO,
    payment_method:   'cash',
  }));

  const { error: insertErr } = await db.from('bookings').insert(rows);
  if (insertErr) {
    console.warn('[setup] Failed to seed bookings:', insertErr.message);
  } else {
    console.log(`[setup] Seeded ${rows.length} pending bookings.`);
  }

  // ─── Reset existing drivers to 'free' ─────────────────────────────────────
  const { data: drivers, error: fetchErr } = await db
    .from('drivers')
    .select('id')
    .eq('org_id', ANIL_CABS_ORG)
    .limit(20);

  if (fetchErr) {
    console.warn('[setup] Could not fetch drivers:', fetchErr.message);
  } else if (drivers && drivers.length > 0) {
    await db.from('drivers')
      .update({ status: 'free' })
      .in('id', drivers.map((d: any) => d.id));
    console.log(`[setup] Reset ${drivers.length} driver(s) to free.`);
  } else {
    console.warn('[setup] No drivers found — driver-assignment tests will be skipped.');
  }

  // ─── Seed 2 pending-approval drivers (for approval-flow tests) ────────────
  // Clean first
  await db.from('drivers')
    .delete()
    .eq('org_id', ANIL_CABS_ORG)
    .like('name', 'PW Test Driver%');

  await db.from('drivers').insert([
    { org_id: ANIL_CABS_ORG, name: 'PW Test Driver A', phone: '+919000000001', status: 'pending_approval' },
    { org_id: ANIL_CABS_ORG, name: 'PW Test Driver B', phone: '+919000000002', status: 'pending_approval' },
  ]);
  console.log('[setup] Seeded 2 pending-approval test drivers.');

  await db.auth.signOut();
  console.log('[setup] Done.');
}
