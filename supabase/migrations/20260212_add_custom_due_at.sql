-- Add custom_due_at column to client_experiences
-- When NULL, the default computed deadline (from signed_on_date + offset) is used.
-- When set, this timestamp overrides the default deadline.
ALTER TABLE client_experiences
  ADD COLUMN custom_due_at timestamptz DEFAULT NULL;
