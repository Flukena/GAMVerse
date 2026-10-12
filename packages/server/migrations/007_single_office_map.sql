CREATE TABLE app_office_maps (
  office_id uuid PRIMARY KEY REFERENCES app_offices(id) ON DELETE CASCADE,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  config jsonb NOT NULL DEFAULT '{"version":1,"layout":{"version":1,"props":[],"zones":[]}}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_office_maps(office_id, config_version, config)
SELECT offices.id,
       COALESCE(lobby.config_version, 1),
       jsonb_build_object(
         'version', 1,
         'layout', jsonb_build_object(
           'version', 1,
           'props', COALESCE(lobby.config #> '{layout,props}', '[]'::jsonb),
           'zones', COALESCE(voice_zones.zones, lobby.config #> '{layout,zones}', '[]'::jsonb)
         )
       )
FROM app_offices offices
LEFT JOIN app_office_rooms lobby ON lobby.office_id = offices.id AND lobby.room_key = 'lobby'
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', zones.id::text,
    'name', zones.name,
    'x', zones.x,
    'z', zones.z,
    'width', zones.radius * 2,
    'depth', zones.radius * 2,
    'color', '#ef91b5'
  ) ORDER BY zones.name) AS zones
  FROM app_private_voice_zones zones
  WHERE zones.office_id = offices.id
) voice_zones ON true
ON CONFLICT (office_id) DO NOTHING;

DROP TABLE app_private_voice_zones;
DROP TABLE app_office_rooms;
