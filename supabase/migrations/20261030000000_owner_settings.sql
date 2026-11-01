-- Owner settings and personalisation.
--
-- Before: a fleet owner could not change what customers and drivers see without a developer.
--
-- After: the owner sets tagline, welcome message, service area and hours, contact numbers,
-- highlights, payment methods and notes from the Settings screen. Public text lives on
-- organizations (readable by anyone, so only things meant for customers). Driver-only text lives
-- in org_driver_info, which only that fleet's admin and its approved, signed-in drivers can read.
-- Logos and UPI QR images go to a public storage bucket, org-branding, under <org_id>/.
--
-- Additive and safe to re-run. No rows are deleted. Existing rows keep passing the new
-- constraints: the new columns start empty, and brand_color is checked as NOT VALID (see 2).

BEGIN;

-- 1. New organisation columns. Blank means "do not show it"; the app never invents a fallback.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tagline           text,
  ADD COLUMN IF NOT EXISTS welcome_message   text,
  ADD COLUMN IF NOT EXISTS service_area      text,
  ADD COLUMN IF NOT EXISTS service_hours     text,
  ADD COLUMN IF NOT EXISTS support_phone     text,
  ADD COLUMN IF NOT EXISTS whatsapp_phone    text,
  ADD COLUMN IF NOT EXISTS cancellation_note text,
  ADD COLUMN IF NOT EXISTS thank_you_message text,
  ADD COLUMN IF NOT EXISTS highlights        text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_methods   text[] NOT NULL DEFAULT '{cash,upi}';

-- 2. Limits. Dropped first so the file can run again.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_tagline_len,
  DROP CONSTRAINT IF EXISTS organizations_welcome_len,
  DROP CONSTRAINT IF EXISTS organizations_service_area_len,
  DROP CONSTRAINT IF EXISTS organizations_service_hours_len,
  DROP CONSTRAINT IF EXISTS organizations_cancellation_len,
  DROP CONSTRAINT IF EXISTS organizations_thank_you_len,
  DROP CONSTRAINT IF EXISTS organizations_brand_color_hex,
  DROP CONSTRAINT IF EXISTS organizations_support_phone_fmt,
  DROP CONSTRAINT IF EXISTS organizations_whatsapp_phone_fmt,
  DROP CONSTRAINT IF EXISTS organizations_payment_methods_valid,
  DROP CONSTRAINT IF EXISTS organizations_highlights_valid;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_tagline_len        CHECK (char_length(tagline) <= 80),
  ADD CONSTRAINT organizations_welcome_len        CHECK (char_length(welcome_message) <= 240),
  ADD CONSTRAINT organizations_service_area_len   CHECK (char_length(service_area) <= 120),
  ADD CONSTRAINT organizations_service_hours_len  CHECK (char_length(service_hours) <= 80),
  ADD CONSTRAINT organizations_cancellation_len   CHECK (char_length(cancellation_note) <= 240),
  ADD CONSTRAINT organizations_thank_you_len      CHECK (char_length(thank_you_message) <= 200),
  ADD CONSTRAINT organizations_support_phone_fmt  CHECK (support_phone  ~ '^\+?[0-9 ]{10,15}$'),
  ADD CONSTRAINT organizations_whatsapp_phone_fmt CHECK (whatsapp_phone ~ '^\+?[0-9 ]{10,15}$'),
  ADD CONSTRAINT organizations_payment_methods_valid
    CHECK (cardinality(payment_methods) >= 1 AND payment_methods <@ ARRAY['cash', 'upi']::text[]),
  ADD CONSTRAINT organizations_highlights_valid
    CHECK (cardinality(highlights) <= 4 AND highlights <@ ARRAY[
      'verified_drivers', 'clean_cars', 'on_time', 'no_hidden_charges',
      'outstation_experts', 'airport_specialists', 'women_friendly', 'twenty_four_seven'
    ]::text[]);

-- brand_color already existed and may hold a value that is not #rrggbb (for example a colour name).
-- NOT VALID enforces the rule on every new or changed value without failing on old ones.
-- Saving from the Settings screen always writes a valid value or null.
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_brand_color_hex CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$') NOT VALID;

-- 3. Organisations use column-level SELECT grants, so the new public columns must be granted.
--    whatsapp_api_key, google_drive_token and admin_user_id stay ungranted.
GRANT SELECT (tagline, welcome_message, service_area, service_hours, support_phone, whatsapp_phone,
              cancellation_note, thank_you_message, highlights, payment_methods)
  ON public.organizations TO anon, authenticated;

-- 4. Driver-only content. Not on organizations, whose public columns anyone can read.
CREATE TABLE IF NOT EXISTS public.org_driver_info (
  org_id       uuid PRIMARY KEY REFERENCES public.organizations (id) ON DELETE CASCADE,
  welcome_note text,
  rules        text,
  office_phone text,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.org_driver_info
  DROP CONSTRAINT IF EXISTS org_driver_info_welcome_len,
  DROP CONSTRAINT IF EXISTS org_driver_info_rules_len,
  DROP CONSTRAINT IF EXISTS org_driver_info_office_phone_fmt;
ALTER TABLE public.org_driver_info
  ADD CONSTRAINT org_driver_info_welcome_len      CHECK (char_length(welcome_note) <= 300),
  ADD CONSTRAINT org_driver_info_rules_len        CHECK (char_length(rules) <= 1000),
  ADD CONSTRAINT org_driver_info_office_phone_fmt CHECK (office_phone ~ '^\+?[0-9 ]{10,15}$');

-- The org of the signed-in driver, if approved. SECURITY DEFINER so it works whatever the
-- drivers table policies say, and returns nothing for drivers still pending approval.
CREATE OR REPLACE FUNCTION public.my_approved_driver_org()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT d.org_id FROM public.drivers d
   WHERE d.id = public.my_driver_id() AND d.status IS DISTINCT FROM 'pending_approval';
$$;
REVOKE ALL ON FUNCTION public.my_approved_driver_org() FROM public;
GRANT EXECUTE ON FUNCTION public.my_approved_driver_org() TO authenticated;

ALTER TABLE public.org_driver_info ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.org_driver_info FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_driver_info TO authenticated;

DROP POLICY IF EXISTS "org_admin_all_driver_info" ON public.org_driver_info;
CREATE POLICY "org_admin_all_driver_info" ON public.org_driver_info
  FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "driver_read_own_org_driver_info" ON public.org_driver_info;
CREATE POLICY "driver_read_own_org_driver_info" ON public.org_driver_info
  FOR SELECT TO authenticated USING (org_id = public.my_approved_driver_org());

-- 5. Public bucket for logos and UPI QR images. Raster images only, never SVG.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('org-branding', 'org-branding', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

-- First folder of an object path as a uuid, or null when it is not one, so a bad path is
-- denied instead of raising a cast error.
CREATE OR REPLACE FUNCTION public.org_branding_folder_org(p_name text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN ((storage.foldername(p_name))[1])::uuid
  END;
$$;
GRANT EXECUTE ON FUNCTION public.org_branding_folder_org(text) TO anon, authenticated;

DROP POLICY IF EXISTS "org_branding_public_read" ON storage.objects;
CREATE POLICY "org_branding_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'org-branding');

DROP POLICY IF EXISTS "org_branding_admin_insert" ON storage.objects;
CREATE POLICY "org_branding_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'org-branding' AND public.is_org_admin(public.org_branding_folder_org(name)));

DROP POLICY IF EXISTS "org_branding_admin_update" ON storage.objects;
CREATE POLICY "org_branding_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'org-branding' AND public.is_org_admin(public.org_branding_folder_org(name)))
  WITH CHECK (bucket_id = 'org-branding' AND public.is_org_admin(public.org_branding_folder_org(name)));

DROP POLICY IF EXISTS "org_branding_admin_delete" ON storage.objects;
CREATE POLICY "org_branding_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'org-branding' AND public.is_org_admin(public.org_branding_folder_org(name)));

COMMIT;

NOTIFY pgrst, 'reload schema';
