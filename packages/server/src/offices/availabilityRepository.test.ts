import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { AvailabilityAccessError, AvailabilityRepository } from "./availabilityRepository.js";
const USERNAME = "alice";
const OFFICE_ID = "office-one";
const PROFILE = { status: "away" as const, customStatus: { text: "Writing", emoji: "✍️", expiresAtMs: null } };
test("removed member cannot read or persist availability", async () => {
  let queries = 0;
  const store = { query: async () => { queries++; return { rows: [] }; } } as unknown as Pick<Pool, "query">;
  const repository = new AvailabilityRepository(store, async () => null);
  await assert.rejects(repository.load(USERNAME, OFFICE_ID), AvailabilityAccessError);
  await assert.rejects(repository.save(USERNAME, OFFICE_ID, PROFILE), AvailabilityAccessError);
  assert.equal(queries, 0);
});
test("reads use office and authenticated user scope; expired text never returns", async () => {
  const store = { query: async (_sql: string, values: unknown[]) => {
    assert.deepEqual(values, [OFFICE_ID, USERNAME]);
    return { rows: [{ status: "away", custom_status_text: "Expired", custom_status_emoji: "🕒", custom_status_expires_at: new Date(0) }] };
  } } as unknown as Pick<Pool, "query">;
  const repository = new AvailabilityRepository(store, async () => "owner");
  assert.deepEqual(await repository.load(USERNAME, OFFICE_ID), { status: "away", customStatus: null });
});
test("authorized save preserves parameterized user scope and Unicode custom fields", async () => {
  let parameters: unknown[] = [];
  const store = { query: async (_sql: string, values: unknown[]) => { parameters = values; return { rows: [] }; } } as unknown as Pick<Pool, "query">;
  const repository = new AvailabilityRepository(store, async () => "user");
  await repository.save(USERNAME, OFFICE_ID, PROFILE);
  assert.deepEqual(parameters, [OFFICE_ID, USERNAME, "away", "Writing", "✍️", null]);
});
test("file mode reads default but fails explicit save rather than claim durability", async () => {
  const repository = new AvailabilityRepository(null, async () => "owner");
  assert.deepEqual(await repository.load(USERNAME, OFFICE_ID), { status: "available", customStatus: null });
  await assert.rejects(repository.save(USERNAME, OFFICE_ID, PROFILE), /requires PostgreSQL/);
});
