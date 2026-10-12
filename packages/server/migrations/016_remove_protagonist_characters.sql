UPDATE app_users
SET character_id = 'character-female-a'
WHERE character_id IN (
  'character-protagonist-cyborg',
  'character-protagonist-skater-male',
  'character-protagonist-skater-female',
  'character-protagonist-criminal'
);
