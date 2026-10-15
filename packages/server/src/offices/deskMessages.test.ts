import assert from "node:assert/strict";
import test from "node:test";
import { PlayerState, type RoomLayoutZone } from "@gammyverse/shared";
import { DeskMessages } from "./deskMessages.js";
const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const DESK_ID = "00000000-0000-4000-8000-000000000002";
const ZONE: RoomLayoutZone = { id: "zone", kind: "private", name: "Desk", x: 12, z: 14, width: 4, depth: 4, color: "#ffffff" };
function fixture() {
  let player: PlayerState | undefined = new PlayerState();
  const events: unknown[] = [];
  const starts: unknown[] = [];
  const lookups: unknown[] = [];
  const client = { sessionId: "session", send: (_event: string, payload: unknown) => { events.push(payload); } };
  const state = { username: () => "alice", player: () => player, start: (...args: unknown[]) => { starts.push(args); return "started" as const; } };
  const destination = async (...args: unknown[]) => { lookups.push(args); return { desk: { id: DESK_ID, officeId: OFFICE_ID, zoneId: ZONE.id, ownerUsername: "alice" }, zone: ZONE }; };
  return { events, starts, lookups, client, state, destination, leave: () => { player = undefined; } };
}
test("desk travel resolves authenticated identity and authoritative geometry", async () => {
  const f = fixture();
  await new DeskMessages(OFFICE_ID, f.state, { destination: f.destination }).command(f.client, { deskId: DESK_ID });
  assert.deepEqual(f.lookups, [["alice", OFFICE_ID, DESK_ID]]);
  assert.equal(f.starts[0] && (f.starts[0] as unknown[])[2], ZONE);
  assert.deepEqual(f.events, [{ status: "started", destination: { x: 12, z: 14 } }]);
});
test("invalid coordinates and denied ownership never start a route and produce terminal feedback", async () => {
  const f = fixture();
  const messages = new DeskMessages(OFFICE_ID, f.state, { destination: async () => { throw new Error("Claim this desk before returning to it."); } });
  await messages.command(f.client, { deskId: DESK_ID, x: 99 });
  await messages.command(f.client, { deskId: DESK_ID });
  assert.deepEqual(f.starts, []);
  assert.equal(f.events.length, 2);
  assert.deepEqual(f.events[1], { status: "unreachable", message: "Claim this desk before returning to it." });
});
test("a disconnected player cannot resume a delayed desk lookup", async () => {
  const f = fixture();
  let finish!: () => void;
  const destination = () => new Promise<Awaited<ReturnType<typeof f.destination>>>(resolve => { finish = () => { void f.destination().then(resolve); }; });
  const command = new DeskMessages(OFFICE_ID, f.state, { destination }).command(f.client, { deskId: DESK_ID });
  f.leave(); finish(); await command;
  assert.deepEqual(f.starts, []);
});

test("new travel or map refresh invalidates a delayed desk success", async () => {
  for (const invalidation of ["intent", "map"] as const) {
    const f = fixture();
    let finish!: () => void;
    const destination = () => new Promise<Awaited<ReturnType<typeof f.destination>>>(resolve => { finish = () => { void f.destination().then(resolve); }; });
    const messages = new DeskMessages(OFFICE_ID, f.state, { destination });
    const command = messages.command(f.client, { deskId: DESK_ID });
    if (invalidation === "map") messages.invalidateAll(); else messages.invalidate(f.client.sessionId);
    finish(); await command;
    assert.deepEqual(f.starts, [], invalidation); assert.deepEqual(f.events, [], invalidation);
  }
});
test("a stale denied lookup cannot terminate newer navigation feedback", async () => {
  const f = fixture();
  let reject!: (error: Error) => void;
  const destination = () => new Promise<Awaited<ReturnType<typeof f.destination>>>((_resolve, fail) => { reject = fail; });
  const messages = new DeskMessages(OFFICE_ID, f.state, { destination });
  const command = messages.command(f.client, { deskId: DESK_ID });
  messages.invalidate(f.client.sessionId); reject(new Error("Desk removed")); await command;
  assert.deepEqual(f.events, []);
});
