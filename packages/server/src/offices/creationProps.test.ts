import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { createCampusOfficeDraft, generateCampusMap, type RoomLayoutProp } from "@gammyverse/shared";
import { saveOfficeProps } from "./repository.js";

const OFFICE_ID = "new-office";
const USERNAME = "alice";
const FIRST_VERSION = 1;
const GENERATOR_INPUTS = { totalPeople: 20, peoplePerTeam: 5, teamCount: 4, seed: 7 } as const;

const draft = generateCampusMap(GENERATOR_INPUTS).layout;

class CreationSeam {
  props: unknown[] = [];
  propsVersion = FIRST_VERSION;
  constructor(readonly map: unknown) {}

  async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    if (sql.startsWith("SELECT config ")) return { rows: [{ config: this.map }] };
    if (sql.startsWith("SELECT props")) return { rows: [{ props: this.props, config_version: this.propsVersion }] };
    if (sql.startsWith("UPDATE app_office_props")) {
      this.props = JSON.parse(String(values[1])) as unknown[];
      this.propsVersion += 1;
      return { rows: [{ props: this.props, config_version: this.propsVersion }] };
    }
    return { rows: [] };
  }

  dependencies() {
    const store = {
      query: this.query.bind(this),
      connect: async () => ({ query: this.query.bind(this), release: () => {} }),
    } as unknown as Pool;
    return { store, role: async () => "owner" };
  }
}

function seamForDraft() {
  // Map and props persist separately: the map row never carries the props copy.
  return new CreationSeam({ version: 1, layout: { ...draft, props: [] } });
}

test("creation saves every furnished campus prop through the office props validator", async () => {
  const furnished = createCampusOfficeDraft({ totalPeople: 150, peoplePerTeam: 15, teamCount: 10, seed: 12345 }, "furnished").layout;
  const seam = new CreationSeam({ version: 1, layout: { ...furnished, props: [] } });
  const saved = await saveOfficeProps(
    USERNAME, OFFICE_ID, { configVersion: FIRST_VERSION, props: furnished.props }, false, seam.dependencies(),
  );
  assert.equal(saved.props.length, furnished.props.length);
  assert.equal(saved.props.filter(prop => prop.asset === "civic-park-water").length, 4);
  assert.equal(saved.props.filter(prop => prop.asset === "kit:chair" && prop.id.startsWith("shared-townhall-starter-")).length, 200);
  assert.equal(saved.props.filter(prop => prop.asset === "office-civic-screen" || prop.asset === "office-townhall-screen").length, 4);
});

test("a generated campus draft places wall-mounted restroom mirrors above the floor", () => {
  const mirrors = draft.props.filter((prop) => prop.asset === "kit:bathroommirror");
  assert.ok(mirrors.length > 0);
  assert.ok(mirrors.every((mirror) => (mirror.elevation ?? 0) > 1));
});

test("creation persists every generated prop, including elevated restroom mirrors", async () => {
  const seam = seamForDraft();
  const saved = await saveOfficeProps(
    USERNAME, OFFICE_ID, { configVersion: FIRST_VERSION, props: draft.props }, false, seam.dependencies(),
  );
  assert.equal(saved.props.length, draft.props.length);
  assert.equal(saved.configVersion, FIRST_VERSION + 1);
  const savedMirrors = saved.props.filter((prop) => prop.asset === "kit:bathroommirror");
  assert.equal(savedMirrors.length, draft.props.filter((prop) => prop.asset === "kit:bathroommirror").length);
  assert.ok(savedMirrors.every((mirror) => (mirror.elevation ?? 0) > 1));
});

test("an elevated floor prop without a supporting surface is still rejected", async () => {
  const seam = seamForDraft();
  const sofa = draft.props.find((prop) => prop.asset === "kit:loungesofa")!;
  const floating: RoomLayoutProp = { ...sofa, id: "floating-sofa", elevation: 1.15 };
  await assert.rejects(
    saveOfficeProps(USERNAME, OFFICE_ID, { configVersion: FIRST_VERSION, props: [floating] }, false, seam.dependencies()),
    /Place small props on a table or shelf/,
  );
  assert.deepEqual(seam.props, []);
});
