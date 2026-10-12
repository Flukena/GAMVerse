ALTER TABLE app_office_rooms
  DROP CONSTRAINT app_office_rooms_check;

ALTER TABLE app_office_rooms
  ADD CONSTRAINT app_office_rooms_owner_type_check
  CHECK ((room_type = 'private') OR owner_username IS NULL);
