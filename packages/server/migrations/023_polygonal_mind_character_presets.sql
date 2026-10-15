ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_character_id_allowed;
ALTER TABLE app_users
  ADD CONSTRAINT app_users_character_id_allowed
  CHECK (
    character_id IS NULL OR character_id IN (
      'character-female-a', 'character-female-b', 'character-female-c',
      'character-female-d', 'character-female-e', 'character-female-f',
      'character-male-a', 'character-male-b', 'character-male-c',
      'character-male-d', 'character-male-e', 'character-male-f',
      'character-blocky-a', 'character-blocky-b', 'character-blocky-c',
      'character-blocky-d', 'character-blocky-e', 'character-blocky-f',
      'character-blocky-g', 'character-blocky-h', 'character-blocky-i',
      'character-blocky-j', 'character-blocky-k', 'character-blocky-l',
      'character-blocky-m', 'character-blocky-n', 'character-blocky-o',
      'character-blocky-p', 'character-blocky-q', 'character-blocky-r',
      'character-zombie-matt',
      'character-pm-jimmy', 'character-pm-old-moustache', 'character-pm-cappy',
      'character-pm-observer', 'character-pm-hugo', 'character-pm-chill',
      'character-pm-retroman', 'character-pm-kate', 'character-pm-mafiossini',
      'character-pm-david', 'character-pm-samuela', 'character-pm-jennifer',
      'character-pm-erika', 'character-pm-lydia', 'character-pm-olivia',
      'character-pm-rose', 'character-pm-shiro', 'character-pm-kyle',
      'character-pm-robert', 'character-pm-lilbro', 'character-pm-mikel',
      'character-pm-baldman'
    )
  );
