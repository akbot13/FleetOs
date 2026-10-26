# FleetOs

Fleet management for small cab operators (5–50 vehicles) in tier-2 Indian cities. One web app serves three people:

- **Customers** book a city, airport, sightseeing or outstation ride and follow it with a private tracking link.
- **Drivers** sign in with a PIN their fleet admin sets, take trips, record odometer photos, and log expenses, collections and cash hand-overs.
- **Fleet admins** create bookings, dispatch the nearest free driver, approve drivers, set PINs, and review collections.

The first fleet is Anil Cabs (`anilcabs`).

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind, shadcn/ui, React Query |
| Backend | Supabase: Postgres with row-level security, auth, storage, realtime, one edge function |
| Maps | Ola Maps first, Mappls as backup, Nominatim/OSRM as the last fallback; Leaflet for display |
| Hosting | Vercel, deploying `main` |

The browser talks to Supabase directly, so every rule lives in the database: row-level security policies, `SECURITY DEFINER` functions and triggers. A check written only in React is not a check.

## Getting started

Requires Node 20 or later.

```bash
npm install
```

Create `.env` from `.env.example`:

```
VITE_SUPABASE_URL=            # https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY= # the public anon key, never the service-role key
VITE_OLA_MAPS_API_KEY=         # optional; maps fall back to Mappls, then OpenStreetMap
VITE_MAPPLS_ACCESS_TOKEN=      # optional
```

```bash
npm run dev
```

The app opens on the customer screen. Use the role switcher to reach the driver and admin screens. One browser holds one Supabase session, so signing in as a driver signs the admin out; use a second browser profile to run both.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run db:check` | Check the live database matches the migrations, using only the public key |

Playwright specs in `tests/` still script the old OTP sign-in and need updating before they pass.

## Database

Migrations are in `supabase/migrations/`, applied in filename order. After any database change, run `npm run db:check`.

Key pieces:

- `is_org_admin(org)`: who may manage an organisation's rows.
- `create_customer_booking()` and `get_booking_status(token)`: the only way customers write and read bookings.
- `quote_fare()`: computes every customer fare from the org's `org_pricing` row; fares sent by the browser are ignored.
- `driver_sign_in()`, `register_driver()`, `set_driver_pin()`: PIN sign-in. PINs are bcrypt-hashed and lock for 15 minutes after five wrong tries.
- Triggers `limit_driver_row_update` and `limit_driver_trip_update`: drivers can change only their duty status, location, trip progress, collections and odometer fields.

Driver sign-in uses anonymous Supabase sessions, so **Anonymous sign-ins** must be enabled under Authentication → Providers.

Full setup for a new Supabase project, including deploying migrations and `migration repair`, is in [docs/SUPABASE_CLIENT_SETUP.md](docs/SUPABASE_CLIENT_SETUP.md).

### Edge function

`supabase/functions/customer-comms-dispatch` sends booking SMS and WhatsApp messages through a webhook provider. It needs these secrets:

```
SMS_WEBHOOK_URL, SMS_WEBHOOK_TOKEN
WHATSAPP_WEBHOOK_URL, WHATSAPP_WEBHOOK_TOKEN
```

No provider is live yet. Indian SMS also needs DLT registration of the sender and templates.

## Project layout

```
src/
  components/admin/     dashboard, dispatch, pricing, collections, driver PIN control
  components/driver/    driver app, split by job (trip map, alarm, cash, contact)
  components/customer/  booking form, summary and status
  components/auth/      admin and driver sign-in
  lib/                  dispatch ranking, distance, cash maths, map providers (with tests)
  hooks/                org and data hooks
  integrations/supabase generated database types and client
supabase/
  migrations/           database schema, policies and functions
  functions/            edge functions
scripts/check-db.mjs    live database check
docs/                   runbooks, onboarding guide, reviews
```

## Docs

- [Client onboarding](docs/CLIENT_ONBOARDING.md): for a fleet owner starting on FleetOs
- [Supabase setup runbook](docs/SUPABASE_CLIENT_SETUP.md)
- [Architecture review](docs/ARCHITECTURE_REVIEW.md)
- [Build review](docs/BUILD_CRITIQUE.html): blockers, issue register, schedule and use cases
- [Customer automation](docs/CUSTOMER_AUTOMATION.md)

## Status

Working against the live database: tenant isolation, customer booking with tracking, PIN sign-in, dispatch by real distance, driver cash logging, and server-side fares.

Not done yet: online payments, a live SMS/WhatsApp provider, odometer photo bucket rules, saving from the admin Pricing screen, a live map for customers, CI, and onboarding for a second fleet. See the build review for the full list.
