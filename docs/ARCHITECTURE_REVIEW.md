# FleetOs Architecture Review

Date: 2026-10-20. Scope: source tree, Supabase data access, and live-database checks from the sandbox. Read-only except for one marked test booking, which was inserted and deleted.

## 1. Shape of the system

- **Single-page React app** (Vite, TypeScript, Tailwind, shadcn/ui, React Query) with no backend of its own.
- **Three role surfaces** switched in `src/pages/Index.tsx` and stored in `localStorage`:
  - Customer: `components/customer/*` (booking flows, live tracking). No login.
  - Admin: `components/admin/*` (dashboard, dispatch, pricing, collections). Supabase email/password login.
  - Driver: `components/driver/DriverApp.tsx` (one large file, roughly 1,500 lines). Phone-based login through `DriverLoginPage.tsx`.
- **Backend:** Supabase only. Browser code queries tables directly through `src/integrations/supabase/client.ts`.
- **One edge function:** `supabase/functions/customer-comms-dispatch/index.ts` (92 lines) for customer notifications.
- **Migrations:** 7 files in `supabase/migrations`.

## 2. Data flow

| Table used by code | Count of call sites | Used by |
|---|---|---|
| `bookings` | 18 | customer booking, admin dashboard, dispatch, driver trips |
| `drivers` | 15 | driver login, admin fleet list, dispatch |
| `user_roles` | 1 | role check after admin login |
| `organizations`, `org_pricing` | 1 each | multi-tenant org context and pricing |
| `messages_log` | 1 | customer messaging log |

Main paths:
1. **Customer booking:** `BookingFlow` / `BookNowFlow` → insert into `bookings` using the anon key. Status is then polled.
2. **Dispatch:** `DispatchEngine` assigns a driver by updating `bookings.driver_id`.
3. **Driver app:** phone lookup in `drivers`, then a trips query on `bookings`, then status and handover updates.
4. **Notifications:** the edge function handles customer messages and writes to `messages_log`.

## 3. Findings

**Security (highest priority)**
- The repo is public. The Supabase anon key is hardcoded in `src/integrations/supabase/client.ts` and `tests/global-setup.ts`. The anon key is designed to be public, but only if RLS is correct.
- The anon key can read `Drivers` (10 rows, including phone numbers) and can insert and delete on `bookings`. Confirmed with the live database.
- Driver login depends on anon read access to drivers by phone. Restricting it needs a lookup function first (see the draft in the earlier chat).

**Schema drift**
- Two drivers tables exist in the live database: `Drivers` (no `org_id`) and `drivers` (has `org_id`). The app uses lowercase `drivers`.
- The generated types in `types.ts` name the tables `"bookings table"` and `"Drivers"`, which doesn't match the code. This is why several `as any` casts exist.
- Result: type checking is effectively off for the core tables.

**Code health**
- TypeScript: 0 errors (down from 16).
- Build: passes. The main JS chunk is 787 kB, above Vite's 500 kB warning.
- ESLint: 98 errors, 16 warnings, mostly `any`.
- Tests: one placeholder test. No coverage of booking, dispatch, or driver flows.
- `DriverApp.tsx` is a single large component and holds most of the driver logic.

**Unfinished**
- Undo handover is a stub.
- Payment hardening, SMS, and WhatsApp delivery are deferred.
- Driver role in `user_roles` is missing from the database enum; driver access goes through a session check instead.

## 4. Recommended order

1. Restrict anon access to `Drivers` through a lookup function.
2. Make the repo private and move the anon key to environment config.
3. Pick one drivers table and one bookings table name, then regenerate types and remove the `as any` casts.
4. Add tests for the booking and driver flows.
5. Split `DriverApp.tsx` into smaller components.

## Types drift

- src/integrations/supabase/types.ts names the tables "bookings table" and "Drivers", while the code queries "bookings" and "drivers". The generated types do not match the real table names.
- There are many `as any` casts in `src` (about 44 occurrences across 11 files), which hide type errors at the Supabase boundary.
- Fix: regenerate with `npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`, then remove the casts.