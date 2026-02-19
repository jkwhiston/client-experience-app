-- ============================================================
-- STEP 1: Run this FIRST, then run Step 2 separately.
-- (New enum values must be committed before they can be used.)
-- ============================================================

ALTER TYPE experience_type ADD VALUE IF NOT EXISTS 'monthly';
ALTER TABLE client_experiences ADD COLUMN IF NOT EXISTS month_number integer;


-- ============================================================
-- STEP 2: Run this AFTER Step 1 has been committed.
-- Replaces the unique constraint to allow multiple monthly rows
-- per client (one per month_number), then backfills.
-- ============================================================

-- DELETE FROM client_experiences WHERE experience_type = 'monthly';
--
-- ALTER TABLE client_experiences DROP CONSTRAINT client_experiences_client_id_experience_type_key;
--
-- CREATE UNIQUE INDEX client_experiences_client_id_experience_type_key
-- ON client_experiences (client_id, experience_type, COALESCE(month_number, 0));
--
-- INSERT INTO client_experiences (client_id, experience_type, month_number, status, notes, todos)
-- SELECT c.id, 'monthly', m.month_number, 'pending', '', '[]'::jsonb
-- FROM clients c
-- CROSS JOIN generate_series(2, 18) AS m(month_number)
-- WHERE NOT EXISTS (
--   SELECT 1 FROM client_experiences ce
--   WHERE ce.client_id = c.id
--     AND ce.experience_type = 'monthly'
--     AND ce.month_number = m.month_number
-- );
