CREATE TABLE app_users (
  username varchar(24) PRIMARY KEY,
  password_salt char(32) NOT NULL,
  password_hash char(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_username_format CHECK (username ~ '^[a-z0-9_.-]{3,24}$')
);

CREATE TABLE app_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(24) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX app_sessions_active_lookup ON app_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX app_users_last_active ON app_users(last_active_at);

CREATE TABLE app_system_flags (
  flag varchar(100) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
