CREATE TABLE app_office_props (
  office_id uuid PRIMARY KEY REFERENCES app_offices(id) ON DELETE CASCADE,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  props jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(props) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preserve props previously stored as part of the admin map configuration.
INSERT INTO app_office_props(office_id, config_version, props, updated_at)
SELECT office_id, 1, COALESCE(config #> '{layout,props}', '[]'::jsonb), updated_at
FROM app_office_map_layouts
WHERE jsonb_typeof(config #> '{layout,props}') = 'array'
  AND jsonb_array_length(COALESCE(config #> '{layout,props}', '[]'::jsonb)) > 0
ON CONFLICT (office_id) DO NOTHING;
