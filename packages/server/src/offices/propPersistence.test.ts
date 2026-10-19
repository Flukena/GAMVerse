import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { ROOM_PROP_CATALOG, readRoomLayout } from "@gammyverse/shared";
import {
  OfficePropsVersionConflict,
  saveOfficeMapLayout,
  saveOfficeProps,
} from "./repository.js";

const OFFICE_ID = "interaction-office";
const USERNAME = "alice";
const INITIAL_VERSION = 1;
const CURRENT_PROPS_VERSION = 3;
const INTERACTION = {
  kind: "note",
  title: "Welcome",
  text: "Team notes",
} as const;
const PROP = {
  id: "welcome-board",
  asset: ROOM_PROP_CATALOG[0]!.asset,
  x: 0,
  z: 0,
  rotation: 0,
  interaction: INTERACTION,
};

class PersistenceSeam {
  readonly calls: string[] = [];
  props: unknown[] = [PROP];
  propsVersion = INITIAL_VERSION;
  map: unknown = {
    version: INITIAL_VERSION,
    layout: { props: [], zones: [], walls: [], doors: [] },
  };
  released = false;

  async query(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount?: number }> {
    this.calls.push(sql);
    if (sql.includes("SELECT 1 FROM app_offices")) return { rows: [{}], rowCount: 1 };
    if (sql.startsWith("SELECT config,"))
      return { rows: [{ config: this.map, config_version: INITIAL_VERSION }] };
    if (sql.startsWith("SELECT config "))
      return { rows: [{ config: this.map }] };
    if (sql.startsWith("SELECT props"))
      return {
        rows: [{ props: this.props, config_version: this.propsVersion }],
      };
    if (sql.startsWith("UPDATE app_office_props"))
      return this.updateProps(values);
    if (sql.startsWith("UPDATE app_office_map_layouts"))
      return this.updateMap(values);
    return { rows: [] };
  }

  private updateProps(values: unknown[]) {
    this.props = JSON.parse(String(values[1])) as unknown[];
    this.propsVersion += 1;
    return { rows: [{ props: this.props, config_version: this.propsVersion }] };
  }

  private updateMap(values: unknown[]) {
    this.map = JSON.parse(String(values[1])) as unknown;
    return {
      rows: [{ config: this.map, config_version: INITIAL_VERSION + 1 }],
    };
  }

  dependencies() {
    const store = {
      query: this.query.bind(this),
      connect: async () => ({
        query: this.query.bind(this),
        release: () => {
          this.released = true;
        },
      }),
    } as unknown as Pool;
    return { store, role: async () => "user" };
  }
}

test("raw unsafe interaction rejects the actual prop save before normalization or persistence", async () => {
  const seam = new PersistenceSeam();
  const invalid = {
    ...PROP,
    interaction: { kind: "link", title: "Unsafe", url: "javascript:alert(1)" },
  };
  await assert.rejects(
    saveOfficeProps(
      USERNAME,
      OFFICE_ID,
      { configVersion: INITIAL_VERSION, props: [invalid] },
      false,
      seam.dependencies(),
    ),
    /interaction is invalid/,
  );
  assert.equal(seam.calls.length, 0);
});

test("prop save returns interaction metadata and a new version after persistence", async () => {
  const seam = new PersistenceSeam();
  const saved = await saveOfficeProps(
    USERNAME,
    OFFICE_ID,
    { configVersion: INITIAL_VERSION, props: [PROP] },
    false,
    seam.dependencies(),
  );
  assert.deepEqual(saved.props[0]?.interaction, INTERACTION);
  assert.deepEqual(
    readRoomLayout({ layout: { props: seam.props } }).props[0]?.interaction,
    INTERACTION,
  );
  assert.equal(saved.configVersion, INITIAL_VERSION + 1);
  assert.equal(seam.released, true);
});

test("stale prop version returns current interaction and does not overwrite it", async () => {
  const seam = new PersistenceSeam();
  seam.propsVersion = CURRENT_PROPS_VERSION;
  await assert.rejects(
    saveOfficeProps(
      USERNAME,
      OFFICE_ID,
      { configVersion: INITIAL_VERSION, props: [] },
      false,
      seam.dependencies(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof OfficePropsVersionConflict);
      assert.deepEqual(error.latest.props[0]?.interaction, INTERACTION);
      assert.equal(error.latest.configVersion, CURRENT_PROPS_VERSION);
      return true;
    },
  );
  assert.equal(
    seam.calls.some((sql) => sql.startsWith("UPDATE app_office_props")),
    false,
  );
  assert.equal(seam.released, true);
});

test("map draft with stale empty props retains latest server interaction metadata", async () => {
  const seam = new PersistenceSeam();
  const dependencies = { ...seam.dependencies(), role: async () => "admin" };
  const saved = await saveOfficeMapLayout(
    USERNAME,
    false,
    OFFICE_ID,
    {
      configVersion: INITIAL_VERSION,
      layout: { props: [], zones: [], walls: [], doors: [] },
    },
    dependencies,
  );
  assert.deepEqual(
    readRoomLayout(saved.config).props[0]?.interaction,
    INTERACTION,
  );
  assert.equal(
    seam.calls.some((sql) => sql.startsWith("UPDATE app_office_props")),
    false,
  );
  assert.equal(seam.released, true);
});

test("maintainers can save office map layouts", async () => {
  const seam = new PersistenceSeam();
  const dependencies = { ...seam.dependencies(), role: async () => "maintainer" };
  const saved = await saveOfficeMapLayout(
    USERNAME,
    true,
    OFFICE_ID,
    { configVersion: INITIAL_VERSION, layout: { props: [], zones: [], walls: [], doors: [] } },
    dependencies,
  );
  assert.equal(saved.configVersion, INITIAL_VERSION + 1);
  assert.ok(seam.calls.some(sql => sql.includes("NOT $4::boolean OR $3::boolean")));
  assert.equal(seam.released, true);
});
