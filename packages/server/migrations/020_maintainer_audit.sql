CREATE TABLE IF NOT EXISTS app_maintainer_audit (
  id bigserial PRIMARY KEY,
  actor_username text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_maintainer_audit_recent_idx
  ON app_maintainer_audit (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS app_maintainer_audit_action_recent_idx
  ON app_maintainer_audit (action, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS app_maintainer_audit_target_recent_idx
  ON app_maintainer_audit (target_type, target_id, occurred_at DESC, id DESC);
