import type { Pool } from "pg";
import { readRoomLayout } from "@gammyverse/shared";
import { projectOfficeDeskConfig } from "./deskRepository.js";

const INITIAL_MAP_VERSION_COUNT = 1;
function emptyMap() { return { version: 1, layout: { version: 1, props: [], zones: [], walls: [], doors: [] } }; }

function mergeSavedProps(config: unknown, rawProps: unknown | null) {
  if (!Array.isArray(rawProps)) return config;
  const parsed = readRoomLayout({ layout: { props: rawProps } });
  return { version: 1, layout: { ...readRoomLayout(config), props: parsed.props } };
}

export async function readOfficeMapProjection(store: Pick<Pool, "query"> | null, officeId: string) {
  if (!store) return { config: emptyMap(), configVersion: INITIAL_MAP_VERSION_COUNT };
  const result = await store.query<{ config: unknown; config_version: number | null; office_props: unknown | null }>(
    `SELECT maps.config, maps.config_version, office_props.props AS office_props
     FROM app_offices offices
     LEFT JOIN app_office_map_layouts maps ON maps.office_id = offices.id
     LEFT JOIN app_office_props office_props ON office_props.office_id = offices.id
     WHERE offices.id = $1`, [officeId]);
  const row = result.rows[0];
  const merged = mergeSavedProps(row?.config ?? emptyMap(), row?.office_props ?? null);
  return { config: await projectOfficeDeskConfig(store, officeId, merged), configVersion: row?.config_version ?? INITIAL_MAP_VERSION_COUNT };
}
