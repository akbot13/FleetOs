# FleetOs Supabase client setup runbook

Operator runbook for setting up a new client. Steps marked **[Supabase action]** change the Supabase project. Do not run them until the owner has approved the target project.

## 1. Prerequisites [Supabase action]

- Supabase CLI installed and logged in with access to the target project.
- Project ref: `vplydlocixunrnjlftbk` (from `supabase/config.toml`). Confirm with the owner that this is the right project before linking.
- Link: `supabase link --project-ref <ref>`

## 2. Apply migrations [Supabase action]

Run in exactly this order:

1. `20260312135554_acd47837-856d-4539-825d-62f1fba354c0.sql`
2. `20260312141230_49641d45-722f-4d04-b09f-806016833e9b.sql`
3. `20260312141249_66c13b55-8f0a-4684-8d05-34895ff5a15f.sql`
4. `20260313114815_66d06561-4a83-48fa-86c9-e0aa2bb697ca.sql`
5. `20260313_fix_bookings_rls.sql`
6. `20260326000000_multi_tenancy_foundation.sql`
7. `20260402010000_booking_notes_and_org_payment_fields.sql`

> **Warning:** `20260313_fix_bookings_rls.sql` sorts after `20260313114815_...` by name, but it must still run fifth, after it. Tools that sort by filename may order it differently from what you expect. Check the order before pushing.

Migration 6 seeds an organization named "Anil Cabs" (id `a0000000-0000-0000-0000-000000000001`, join code `AC01`). Do not reuse it for a new client (see step 4).

## 3. Anon lockdown [Supabase action]

**DO NOT RUN until the owner confirms.** The driver login currently relies on anon read access to `drivers` (policy `anon_read_drivers`), which exposes driver phone numbers. The fix is a lookup function, then dropping that policy.

**DRAFT - review before running.**

```sql
-- DRAFT - review before running
-- (a) Phone lookup that returns only what the driver login needs
CREATE OR REPLACE FUNCTION public.lookup_driver_by_phone(_phone text)
RETURNS TABLE (id bigint, name text, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.name, d.status
  FROM public.drivers d
  WHERE d.phone = _phone;
$$;

-- (b) Let anon call it
REVOKE ALL ON FUNCTION public.lookup_driver_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_driver_by_phone(text) TO anon;

-- (c) Remove direct anon reads of drivers
DROP POLICY IF EXISTS "anon_read_drivers" ON public.drivers;
```

Notes:

- The app code must call this function instead of querying `drivers` before the policy is dropped. Otherwise driver login breaks. Session restore also reads `drivers`; check it.
- Keep the `anon_insert_bookings` policy. Customers book without logging in and need it. Review it (for example, restrict columns or rate-limit) rather than dropping it.

## 4. Seed the organization [Supabase action]

Insert a new row. Do not reuse the Anil Cabs org.

```sql
INSERT INTO organizations (name, slug, brand_name, join_code)
VALUES ('<Client Name>', '<client-slug>', '<Brand Name>', '<4 chars>');
```

- `slug` must be unique.
- `join_code` is `char(4)`. Use a unique 4-character value.
- Optional columns: `upi_id`, `upi_qr_url`, `google_review_url`. There is also `brand_logo_url` and `brand_color`.
- Note the returned `id`. You need it as `org_id` below.

## 5. Seed drivers [Supabase action]

```sql
INSERT INTO drivers (org_id, name, phone, vehicle_model, plate_number)
VALUES ('<new org id>', '<name>', '<phone>', '<model>', '<plate>');
```

`status` defaults to `pending_approval`. Set it explicitly if the driver should be active. Check the status values the admin app expects before choosing one.

## 6. Admin user [Supabase action]

1. Create the auth user in the Supabase dashboard (Authentication, Users) with the client's admin email.
2. Insert the role:

```sql
INSERT INTO user_roles (user_id, role) VALUES ('<auth user id>', 'admin');
```

3. Link the user to the organization:

```sql
UPDATE organizations SET admin_user_id = '<auth user id>' WHERE id = '<new org id>';
```

## 7. Deploy the edge function [Supabase action]

```
supabase functions deploy customer-comms-dispatch
```

The function accepts POST with a JSON body:

| Field | Required | Notes |
|---|---|---|
| `customerPhone` | yes | Destination phone number |
| `intent` | yes | For example `driver_assigned`, `trip_completed_feedback`, `invoice_sent` |
| `message` | yes | Message text |
| `channels` | no | Array of `"sms"` and/or `"whatsapp"`. Default is both. |

Missing required fields return 400. Non-POST returns 405. The response is `{ ok, deliveries }`, where each delivery has `channel`, `status` (`sent`, `failed` or `skipped`) and a status code or reason.

## 8. Environment [Supabase action]

Function secrets (set with `supabase secrets set`). Names only:

- `SMS_WEBHOOK_URL`
- `SMS_WEBHOOK_TOKEN`
- `WHATSAPP_WEBHOOK_URL`
- `WHATSAPP_WEBHOOK_TOKEN`

If a channel's URL is not set, the function returns `skipped` for that channel (reason `missing_endpoint`) and `ok` is false. The token is optional and sent as a Bearer header.

Frontend variables (set in the hosting provider or local `.env`). Names only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_OLA_MAPS_API_KEY`
- `VITE_MAPPLS_ACCESS_TOKEN`

## 9. Verification checklist

- [ ] Admin login works, and the admin lands on the dashboard. [app check]
- [ ] A seeded driver row is visible to the admin. [app check]
- [ ] Confirm the new org and driver rows exist with the right `org_id`. [Supabase action]
- [ ] A test booking inserts with `org_id` set. [Supabase action]
- [ ] Dispatching sets `driver_id` on the booking. [app check]
- [ ] The edge function returns `deliveries` for a test call. [Supabase action]
- [ ] After the lockdown, anon can no longer read `drivers`, and driver login still works through the lookup function. [Supabase action]
- [ ] Delete any test bookings afterwards. [Supabase action]
