-- Add initial intake fields on clients and migrate onboarding enum value day14 -> day10.
-- NOTE: PostgreSQL enum values cannot be removed safely in-place, so this migration
-- adds day10 and migrates row data. The legacy day14 enum label may remain unused.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS initial_intake_date date;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS initial_intake_pulse_enabled boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'experience_type'
      AND e.enumlabel = 'day10'
  ) THEN
    ALTER TYPE experience_type ADD VALUE 'day10';
  END IF;
END $$;

UPDATE client_experiences
SET experience_type = 'day10'::experience_type
WHERE experience_type::text = 'day14';
