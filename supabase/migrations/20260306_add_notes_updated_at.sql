ALTER TABLE public.client_experiences
ADD COLUMN IF NOT EXISTS notes_updated_at timestamptz;

UPDATE public.client_experiences
SET notes_updated_at = updated_at
WHERE notes_updated_at IS NULL
  AND NULLIF(BTRIM(notes), '') IS NOT NULL;
