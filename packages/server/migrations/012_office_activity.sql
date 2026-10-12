CREATE TABLE app_office_activity (
  id bigserial PRIMARY KEY,
  office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
  actor_username varchar(32) NOT NULL,
  activity_type varchar(32) NOT NULL CHECK (activity_type IN (
    'office.join', 'office.leave',
    'meeting.enter', 'meeting.leave',
    'private.enter', 'private.leave',
    'bubble.enter', 'bubble.leave',
    'vehicle.enter', 'vehicle.leave'
  )),
  location_name varchar(120),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX app_office_activity_recent
  ON app_office_activity(office_id, occurred_at DESC, id DESC);
