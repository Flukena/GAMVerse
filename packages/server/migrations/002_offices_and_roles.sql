ALTER TABLE app_users
  ADD COLUMN is_maintainer boolean NOT NULL DEFAULT false;

CREATE TABLE app_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(64) NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 64),
  owner_username varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX app_offices_owner ON app_offices(owner_username);
CREATE INDEX app_offices_inactive_cleanup ON app_offices(last_activity_at) WHERE archived_at IS NULL;

CREATE TABLE app_office_memberships (
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  username varchar(24) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  role varchar(16) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  added_by varchar(24) REFERENCES app_users(username) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, username)
);

CREATE INDEX app_office_memberships_user ON app_office_memberships(username, joined_at DESC);

CREATE TABLE app_office_invites (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  invited_username varchar(24) REFERENCES app_users(username) ON DELETE CASCADE,
  role varchar(16) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  token_hash char(64) NOT NULL UNIQUE,
  created_by varchar(24) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_username varchar(24) REFERENCES app_users(username) ON DELETE SET NULL,
  revoked_at timestamptz
);

CREATE INDEX app_office_invites_recipient ON app_office_invites(invited_username, expires_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX app_office_invites_active_unique ON app_office_invites(office_id, invited_username) WHERE invited_username IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL;

CREATE FUNCTION app_prevent_office_owner_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_owner_last_active timestamptz;
  next_admin_username varchar(24);
BEGIN
  IF NEW.owner_username IS DISTINCT FROM OLD.owner_username THEN
    SELECT last_active_at INTO previous_owner_last_active FROM app_users WHERE username = OLD.owner_username;
    SELECT username INTO next_admin_username FROM app_office_memberships
      WHERE office_id = OLD.id AND role = 'admin'
      ORDER BY joined_at ASC, username ASC LIMIT 1;
    IF previous_owner_last_active < now() - interval '30 days'
      AND (NEW.owner_username = next_admin_username OR NEW.owner_username LIKE 'former:%') THEN
      IF NEW.owner_username = next_admin_username THEN
        DELETE FROM app_office_memberships WHERE office_id = OLD.id AND username = NEW.owner_username;
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'An office owner can only be succeeded after account inactivity';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_office_owner_immutable
  BEFORE UPDATE OF owner_username ON app_offices
  FOR EACH ROW EXECUTE FUNCTION app_prevent_office_owner_change();
