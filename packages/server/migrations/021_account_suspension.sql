ALTER TABLE app_users
  ADD COLUMN suspended_at timestamptz;

CREATE INDEX app_users_active_maintainers_idx
  ON app_users (username)
  WHERE is_maintainer = TRUE AND suspended_at IS NULL;
