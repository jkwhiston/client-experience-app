-- Add todos JSONB column to client_experiences
ALTER TABLE client_experiences
  ADD COLUMN todos jsonb DEFAULT '[]'::jsonb;
