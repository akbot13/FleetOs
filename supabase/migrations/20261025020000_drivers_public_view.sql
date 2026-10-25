-- The customer screen's "cars available" count read drivers_public, which was built on the
-- legacy "Drivers" table (stale data, now closed). Rebuild it on the real drivers table.
-- Public columns only: no phone, plate or location. Pending applicants are left out.

BEGIN;

DROP VIEW IF EXISTS public.drivers_public;
CREATE VIEW public.drivers_public AS
  SELECT id, org_id, name, vehicle_model, status
    FROM public.drivers
   WHERE status IN ('free', 'on-trip', 'offline');

GRANT SELECT ON public.drivers_public TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
