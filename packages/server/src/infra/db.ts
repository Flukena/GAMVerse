import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Resolved from the package root: tsx runs src/ while the esbuild bundle runs from dist/, so a file-relative URL differs between them.
const MIGRATIONS_DIRECTORY = join(process.cwd(), "migrations");

const databaseUrl = process.env.DATABASE_URL;
const hasDatabaseConfig = Boolean(databaseUrl || process.env.PGHOST || process.env.PGDATABASE);
if (process.env.NODE_ENV === "production" && !hasDatabaseConfig) {
  throw new Error("Set DATABASE_URL or PostgreSQL connection environment variables in production.");
}

const dbPoolMax = Number(process.env.DB_POOL_MAX ?? 10);
if (!Number.isInteger(dbPoolMax) || dbPoolMax < 1 || dbPoolMax > 100) {
  throw new Error("DB_POOL_MAX must be an integer between 1 and 100.");
}

export const database = hasDatabaseConfig
  ? new Pool({
      ...(databaseUrl ? { connectionString: databaseUrl } : {}),
      max: dbPoolMax,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      application_name: "gammyverse-office",
    })
  : null;

database?.on("error", () => console.error("Unexpected idle PostgreSQL client error."));

export async function initializeDatabase() {
  if (!database) return;
  const migrations = [
    { version: 1, file: "001_production.sql" },
    { version: 2, file: "002_offices_and_roles.sql" },
    { version: 3, file: "003_account_recovery.sql" },
    { version: 4, file: "004_private_voice_zones.sql" },
    { version: 5, file: "005_office_rooms.sql" },
    { version: 6, file: "006_shared_layout_rooms.sql" },
    { version: 7, file: "007_single_office_map.sql" },
    { version: 8, file: "008_remove_office_maps.sql" },
    { version: 9, file: "009_character_profiles.sql" },
    { version: 10, file: "010_blocky_character_profiles.sql" },
    { version: 11, file: "011_user_character_models.sql" },
    { version: 12, file: "012_office_activity.sql" },
    { version: 13, file: "013_office_map_layouts.sql" },
    { version: 14, file: "014_protagonist_character_profiles.sql" },
    { version: 15, file: "015_expand_character_id.sql" },
    { version: 16, file: "016_remove_protagonist_characters.sql" },
    { version: 17, file: "017_add_quaternius_zombie_character.sql" },
    { version: 18, file: "018_office_owned_props.sql" },
    { version: 19, file: "019_user_nickname.sql" },
    { version: 20, file: "020_maintainer_audit.sql" },
    { version: 21, file: "021_account_suspension.sql" },
    { version: 22, file: "022_office_chat_messages.sql" },
    { version: 23, file: "023_polygonal_mind_character_presets.sql" },
    { version: 24, file: "024_kaykit_character_presets.sql" },
    { version: 25, file: "025_office_user_availability_compat.sql" },
    { version: 26, file: "026_office_desks_compat.sql" },
    { version: 27, file: "027_character_presets_compat.sql" },
  ];
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724031105)");
    await client.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const migration of migrations) {
      const applied = await client.query("SELECT version FROM app_schema_migrations WHERE version = $1", [migration.version]);
      if (applied.rowCount === 0) {
        const sql = await readFile(join(MIGRATIONS_DIRECTORY, migration.file), "utf8");
        await client.query(sql);
        await client.query("INSERT INTO app_schema_migrations(version) VALUES ($1)", [migration.version]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function databaseIsReady() {
  if (!database) return process.env.NODE_ENV !== "production";
  await database.query("SELECT 1");
  return true;
}

export async function closeDatabase() {
  await database?.end();
}
