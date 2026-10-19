CREATE TABLE app_office_share_links (
  id uuid PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_by text NOT NULL REFERENCES app_users(username),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX office_share_links_office_idx ON app_office_share_links(office_id);
