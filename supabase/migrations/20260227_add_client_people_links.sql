-- Add per-client external workspace people links.
-- Used for row context-menu quick links and bulk JSON import merge updates.

CREATE TABLE IF NOT EXISTS client_people_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  person_id text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_people_links_display_name_not_blank CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT client_people_links_person_id_not_blank CHECK (length(btrim(person_id)) > 0),
  CONSTRAINT client_people_links_client_id_display_name_key UNIQUE (client_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_client_people_links_client_id
  ON client_people_links (client_id);

CREATE INDEX IF NOT EXISTS idx_client_people_links_client_sort
  ON client_people_links (client_id, sort_order, display_name);

DROP TRIGGER IF EXISTS trg_client_people_links_updated_at ON client_people_links;
CREATE TRIGGER trg_client_people_links_updated_at
BEFORE UPDATE ON client_people_links
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
