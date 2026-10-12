CREATE TABLE app_office_map_layouts (
  office_id uuid PRIMARY KEY REFERENCES app_offices(id) ON DELETE CASCADE,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  config jsonb NOT NULL DEFAULT '{"version":1,"layout":{"version":1,"props":[],"zones":[],"walls":[],"doors":[]}}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
