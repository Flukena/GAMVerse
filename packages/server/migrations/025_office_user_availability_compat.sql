-- Feature-development databases already created this table under legacy version 23.
CREATE TABLE IF NOT EXISTS app_office_user_availability (
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  username varchar(24) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  status varchar(24) NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'do-not-disturb', 'in-meeting', 'away', 'toilet', 'lunch', 'coffee-break')),
  custom_status_text varchar(80) NOT NULL DEFAULT '',
  custom_status_emoji varchar(16) NOT NULL DEFAULT '',
  custom_status_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (office_id, username)
);
