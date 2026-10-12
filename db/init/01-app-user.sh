#!/bin/sh
set -eu

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE gammyverse_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE gammyverse TO gammyverse_app;
GRANT USAGE, CREATE ON SCHEMA public TO gammyverse_app;
SQL
