-- The driver app saves odometer photo links to these columns, but they never existed,
-- so every link was silently dropped (found when the generated types replaced `as any`).

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS odometer_start_photo text,
  ADD COLUMN IF NOT EXISTS odometer_end_photo text;

NOTIFY pgrst, 'reload schema';
