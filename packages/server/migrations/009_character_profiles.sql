ALTER TABLE app_users
  ADD COLUMN character_id varchar(32);

-- Existing accounts keep the avatar that was already used by the live world.
-- New accounts stay NULL until they finish first-login character selection.
UPDATE app_users
SET character_id = 'character-female-a'
WHERE character_id IS NULL;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_character_id_allowed
  CHECK (
    character_id IS NULL OR character_id IN (
      'character-female-a', 'character-female-b', 'character-female-c',
      'character-female-d', 'character-female-e', 'character-female-f',
      'character-male-a', 'character-male-b', 'character-male-c',
      'character-male-d', 'character-male-e', 'character-male-f'
    )
  );
