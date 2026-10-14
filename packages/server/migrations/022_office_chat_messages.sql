CREATE TABLE app_office_chat_messages (
 id bigserial PRIMARY KEY,
 office_id uuid NOT NULL REFERENCES app_offices(id) ON DELETE CASCADE,
 scope text NOT NULL CHECK (scope IN ('office', 'dm')),
 sender_username text NOT NULL,
 recipient_username text,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((scope = 'dm' AND recipient_username IS NOT NULL) OR (scope = 'office' AND recipient_username IS NULL))
);
CREATE INDEX office_chat_scope_id ON app_office_chat_messages(office_id, scope, id);
CREATE INDEX office_chat_pair_id ON app_office_chat_messages(office_id, sender_username, recipient_username, id);
CREATE INDEX office_chat_office_id ON app_office_chat_messages(office_id, id);
