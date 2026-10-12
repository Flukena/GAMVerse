ALTER TABLE app_users ADD COLUMN email varchar(254);
ALTER TABLE app_users ADD CONSTRAINT app_users_email_format CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
CREATE UNIQUE INDEX app_users_email_unique ON app_users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE app_password_resets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(24) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  created_by varchar(24) REFERENCES app_users(username) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX app_password_resets_pending ON app_password_resets(username, expires_at) WHERE used_at IS NULL AND revoked_at IS NULL;
