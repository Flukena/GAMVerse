CREATE TABLE app_private_voice_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  owner_username varchar(24) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  name varchar(40) NOT NULL,
  x real NOT NULL,
  z real NOT NULL,
  radius real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (office_id, owner_username),
  CHECK (length(name) BETWEEN 1 AND 40),
  CHECK (radius >= 1 AND radius <= 8),
  CHECK (x >= -12 AND x <= 12),
  CHECK (z >= -9 AND z <= 9)
);

CREATE INDEX app_private_voice_zones_office ON app_private_voice_zones(office_id);
