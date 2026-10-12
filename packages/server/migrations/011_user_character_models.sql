CREATE TABLE app_user_character_models (
  id uuid PRIMARY KEY,
  username varchar(24) NOT NULL REFERENCES app_users(username) ON DELETE CASCADE,
  label varchar(40) NOT NULL,
  model bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_user_character_models_size CHECK (octet_length(model) BETWEEN 1 AND 10485760)
);

ALTER TABLE app_users ADD COLUMN custom_character_model_id uuid
  REFERENCES app_user_character_models(id) ON DELETE SET NULL;

CREATE INDEX app_user_character_models_owner ON app_user_character_models(username, created_at);
