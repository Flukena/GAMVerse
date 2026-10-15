CREATE TABLE app_office_desks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  zone_id text NOT NULL,
  owner_username text REFERENCES app_users(username) ON DELETE SET NULL,
  retired_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_office_desks_active_zone ON app_office_desks(office_id, zone_id) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX app_office_desks_active_owner ON app_office_desks(office_id, owner_username) WHERE retired_at IS NULL AND owner_username IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM app_office_map_layouts maps
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(maps.config->'layout'->'zones', '[]'::jsonb)) zone
    WHERE zone->>'kind' = 'private' AND NULLIF(zone->>'ownerUsername', '') IS NOT NULL
    GROUP BY maps.office_id, zone->>'ownerUsername' HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Desk migration: duplicate owners in legacy private zones; correct office map ownership before retrying migration 024'; END IF;
  IF EXISTS (
    SELECT 1 FROM app_office_map_layouts maps
    JOIN app_offices offices ON offices.id = maps.office_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(maps.config->'layout'->'zones', '[]'::jsonb)) zone
    WHERE zone->>'kind' = 'private' AND NULLIF(zone->>'ownerUsername', '') IS NOT NULL
      AND (NOT EXISTS (SELECT 1 FROM app_users users WHERE users.username = zone->>'ownerUsername')
        OR (offices.owner_username <> zone->>'ownerUsername' AND NOT EXISTS (SELECT 1 FROM app_office_memberships members WHERE members.office_id = maps.office_id AND members.username = zone->>'ownerUsername')))
  ) THEN RAISE EXCEPTION 'Desk migration: unknown or nonmember legacy desk owner; correct office map ownership before retrying migration 024'; END IF;
END $$;
INSERT INTO app_office_desks(office_id, zone_id, owner_username)
SELECT maps.office_id, zone->>'id', NULLIF(zone->>'ownerUsername', '')
FROM app_office_map_layouts maps
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(maps.config->'layout'->'zones', '[]'::jsonb)) zone
WHERE zone->>'kind' = 'private';
