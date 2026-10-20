CREATE TABLE app_runtime_diagnostics (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('browser', 'api', 'realtime')),
  code text NOT NULL CHECK (code IN (
    'frame_stall', 'slow_frames', 'long_task', 'browser_error', 'unhandled_rejection',
    'connection_drop', 'connection_error', 'join_error', 'media_error',
    'cpu_peak', 'event_loop_stall', 'server_error'
  )),
  office_id uuid,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX app_runtime_diagnostics_retention_idx ON app_runtime_diagnostics (occurred_at);
