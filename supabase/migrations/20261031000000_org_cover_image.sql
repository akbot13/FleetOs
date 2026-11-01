-- Cover photo for the customer home screen.
--
-- Before: the customer home hero is always a solid brand colour.
-- After: the owner can upload a cover photo (Settings, Your brand). organizations.cover_image_url
-- holds its public URL in the org-branding bucket; blank means the hero stays solid brand colour.
--
-- The app reads organizations through an explicit column list, so APPLY THIS BEFORE DEPLOYING
-- the code that selects cover_image_url. Additive and safe to re-run. No rows are changed.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cover_image_url text;

-- Customers (anon) read public organization columns by explicit grant.
GRANT SELECT (cover_image_url) ON public.organizations TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
