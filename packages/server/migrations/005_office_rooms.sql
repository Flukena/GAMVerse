CREATE TABLE app_office_rooms (
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  room_key varchar(40) NOT NULL,
  room_type varchar(16) NOT NULL CHECK (room_type IN ('lobby', 'meeting', 'private')),
  name varchar(48) NOT NULL,
  owner_username varchar(24) REFERENCES app_users(username) ON DELETE CASCADE,
  is_locked boolean NOT NULL DEFAULT false,
  config_version integer NOT NULL DEFAULT 1 CHECK (config_version > 0),
  config jsonb NOT NULL DEFAULT '{"version":1,"spawn":{"x":0,"z":0},"portal":{"x":0,"z":0,"radius":1.35},"returnPortal":{"x":0,"z":7,"radius":1.2}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, room_key),
  CHECK (length(trim(name)) BETWEEN 1 AND 48),
  CHECK ((room_type = 'private' AND owner_username IS NOT NULL) OR (room_type <> 'private' AND owner_username IS NULL)),
  CHECK ((room_type = 'lobby' AND room_key = 'lobby') OR room_type <> 'lobby')
);

CREATE UNIQUE INDEX app_office_rooms_owner_private
  ON app_office_rooms(office_id, owner_username)
  WHERE room_type = 'private';
CREATE UNIQUE INDEX app_office_rooms_single_lobby
  ON app_office_rooms(office_id)
  WHERE room_type = 'lobby';
CREATE INDEX app_office_rooms_by_office ON app_office_rooms(office_id, room_type, name);

INSERT INTO app_office_rooms(office_id, room_key, room_type, name, config)
SELECT id, 'lobby', 'lobby', 'Office', '{"version":1,"spawn":{"x":0,"z":-6},"returnPortal":{"x":0,"z":0,"radius":1.2}}'::jsonb
FROM app_offices
ON CONFLICT (office_id, room_key) DO NOTHING;

INSERT INTO app_office_rooms(office_id, room_key, room_type, name, config)
SELECT id, 'meeting', 'meeting', 'Meeting room', '{"version":1,"spawn":{"x":0,"z":0},"portal":{"x":0,"z":0,"radius":1.35},"returnPortal":{"x":0,"z":7,"radius":1.2}}'::jsonb
FROM app_offices
ON CONFLICT (office_id, room_key) DO NOTHING;
