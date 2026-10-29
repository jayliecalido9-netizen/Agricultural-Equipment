#!/bin/sh
set -eu
# Runs only when PostgreSQL initializes an EMPTY data volume.
# Secrets are psql parameters, never interpolated into executable SQL.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set migrator_password="$AEAMS_MIGRATOR_PASSWORD" \
  --set app_password="$AEAMS_APP_PASSWORD" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE aeams_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'migrator_password';
CREATE ROLE aeams_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'app_password';
CREATE SCHEMA aeams AUTHORIZATION aeams_migrator;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
GRANT USAGE ON SCHEMA public TO aeams_migrator;
ALTER ROLE aeams_migrator SET search_path TO aeams, public;
ALTER ROLE aeams_app SET search_path TO aeams, public;
SQL
